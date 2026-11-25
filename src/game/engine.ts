import {
  DailyChallengeConfig,
  GameMode,
  PlayerStats,
  RemotePlayerState,
  RunSummary,
  ShipClass,
  UpgradeDefinition,
} from '../types';
import { soundEngine } from '../utils/audio';
import { realtimeClient, RemoteBulletPayload } from '../utils/realtime';
import { SHIP_CLASSES, UPGRADE_CATALOG } from './constants';
import { createSeededRng } from './daily';

export interface HidingSpot {
  id: number;
  x: number;
  y: number;
  radius: number;
  pulsePhase: number;
  compromisedTimer: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  decay: number;
  glow?: boolean;
}

export interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  alpha: number;
  size: number;
  isCrit?: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  isCrit: number; // 0: no, 1: crit
  color: string;
  life: number;
  isHoming?: boolean;
  targetId?: number;
  isEnemy?: boolean;
  pierce?: number;
  hitEnemyIds?: Set<number>;
}

export interface OrbitingOrb {
  angle: number;
  distance: number;
  radius: number;
  damage: number;
  color: string;
}

export interface DropItem {
  id: number;
  x: number;
  y: number;
  type: 'xp_small' | 'xp_medium' | 'xp_large' | 'health' | 'nuke';
  value: number;
  radius: number;
  color: string;
  pulseTimer: number;
}

export interface Enemy {
  id: number;
  type: 'drone' | 'swarmer' | 'weaver' | 'brute' | 'sniper' | 'boss_goliath' | 'boss_nexus';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  color: string;
  xpValue: number;
  angle: number;
  // Specific enemy timers
  attackTimer: number;
  specialTimer: number;
  isCharging?: boolean;
  chargeTarget?: { x: number; y: number };
  aimingAtPlayer?: boolean;
  isBoss?: boolean;
  bossPhase?: number;
  patrolAngle?: number;
  patrolTimer?: number;
}

export interface EngineCallbacks {
  onStatsUpdate: (stats: PlayerStats) => void;
  onScoreUpdate: (score: number, kills: number, time: number) => void;
  onLevelUp: (newLevel: number, availableUpgrades: UpgradeDefinition[]) => void;
  onBossState: (boss: { name: string; hp: number; maxHp: number } | null) => void;
  onGameOver: (summary: RunSummary) => void;
  onVictory: (summary: RunSummary) => void;
  onRemotePlayersCount?: (count: number) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: EngineCallbacks;

  // Arena dimensions
  public readonly arenaWidth = 2400;
  public readonly arenaHeight = 2400;

  // Running state
  public isRunning = false;
  public isPaused = false;
  private animationFrameId: number | null = null;
  private lastTime = 0;

  // Settings
  public screenShakeEnabled = true;
  public autoFireEnabled = true;
  public showDamageNumbers = true;

  // Camera
  public cameraX = 0;
  public cameraY = 0;
  private shakeAmount = 0;

  // Game data
  public selectedShip: ShipClass = SHIP_CLASSES[0];
  public gameMode: GameMode = 'survivor';
  public dailyConfig: DailyChallengeConfig | null = null;
  public onlineRoomId = 'PUBLIC';
  public pilotName = 'Rogue Pilot';
  public remotePlayers: RemotePlayerState[] = [];
  public remoteBullets: Bullet[] = [];
  private onlineUnsubscribe: (() => void) | null = null;
  private stateSyncTimer = 0;
  private pendingDropClaims = new Set<number>();
  private onlineDmgAccum = new Map<number, number>();
  public survivalTime = 0; // seconds
  public score = 0;
  public kills = 0;
  public damageDealt = 0;
  public bossesDefeated = 0;
  private nextEntityId = 1;

  // Deterministic RNG streams (used in Daily Challenge mode)
  private layoutRng: () => number = Math.random;
  private waveRng: () => number = Math.random;
  private combatRng: () => number = Math.random;
  private nextDailyBossTime = 150;
  private dailyBossCount = 0;

  // Stealth & Hiding Spots
  public hidingSpots: HidingSpot[] = [];
  private lastKnownPlayerPos = { x: 1200, y: 1200 };
  private inHidingSpot = false;
  private isHidden = false;
  private stealthRevealTimer = 0;
  private ambushNextShot = false;

  // Player Entity
  public player = {
    x: 1200,
    y: 1200,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 18,
    invulnerableTimer: 0,
    shieldRechargeTimer: 0,
    fireTimer: 0,
    dashTimer: 0,
    dashDurationTimer: 0,
    isDashing: false,
    dashTrailTimer: 0,
    stats: {
      level: 1,
      xp: 0,
      xpToNextLevel: 30,
      health: 100,
      maxHealth: 100,
      shield: 50,
      maxShield: 50,
      speed: 5.4,
      fireRate: 4.8,
      damage: 22,
      bulletSpeed: 13,
      bulletCount: 1,
      critChance: 0.08,
      critMultiplier: 2.0,
      pickupRadius: 90,
      regenRate: 0,
      dashCooldown: 2800,
      dashTimer: 0,
      isDashing: false,
      inHidingSpot: false,
      isHidden: false,
      stealthRevealTimer: 0,
      upgrades: {} as Record<string, number>,
    } as PlayerStats,
  };

  // Systems
  public bullets: Bullet[] = [];
  public enemies: Enemy[] = [];
  public drops: DropItem[] = [];
  public particles: Particle[] = [];
  public floatingTexts: FloatingText[] = [];
  public orbitingOrbs: OrbitingOrb[] = [];

  // Upgrades Timers
  private missileTimer = 0;
  private empTimer = 0;
  private killsSinceSingularity = 0;
  private singularities: { x: number; y: number; radius: number; life: number }[] = [];

  // Input state
  public keys: Record<string, boolean> = {
    KeyW: false,
    KeyA: false,
    KeyS: false,
    KeyD: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowDown: false,
    ArrowRight: false,
    Space: false,
  };
  public mouse = {
    screenX: 0,
    screenY: 0,
    worldX: 1200,
    worldY: 1200,
    isDown: false,
  };

  // Spawning director
  private spawnTimer = 0;
  private bossSpawnedStage1 = false;
  private bossSpawnedStage2 = false;
  private currentBoss: Enemy | null = null;
  private shockwaveRings: { x: number; y: number; radius: number; maxRadius: number; color: string; alpha: number }[] = [];

  constructor(canvas: HTMLCanvasElement, callbacks: EngineCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;
    this.resize();
  }

  public resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public startRun(
    ship: ShipClass,
    mode: GameMode = 'survivor',
    dailyConfig?: DailyChallengeConfig,
    onlineOptions?: { roomId: string; pilotName: string }
  ) {
    if (this.onlineUnsubscribe) {
      this.onlineUnsubscribe();
      this.onlineUnsubscribe = null;
    }
    if (mode !== 'online') {
      realtimeClient.leaveRoom();
    }

    this.gameMode = mode;
    this.dailyConfig = mode === 'daily' && dailyConfig ? dailyConfig : null;
    this.onlineRoomId = onlineOptions?.roomId || 'PUBLIC';
    this.pilotName = onlineOptions?.pilotName || 'Rogue Pilot';
    const effectiveShip = this.dailyConfig ? this.dailyConfig.ship : ship;
    this.selectedShip = effectiveShip;

    if (this.dailyConfig) {
      this.layoutRng = createSeededRng(`${this.dailyConfig.dateKey}:layout`);
      this.waveRng = createSeededRng(`${this.dailyConfig.dateKey}:wave`);
      this.combatRng = createSeededRng(`${this.dailyConfig.dateKey}:combat`);
      this.nextDailyBossTime = this.dailyConfig.mutator.bossInterval;
      this.dailyBossCount = 0;
    } else {
      this.layoutRng = Math.random;
      this.waveRng = Math.random;
      this.combatRng = Math.random;
    }

    const mutator = this.dailyConfig?.mutator;
    const maxHealth = Math.round(effectiveShip.baseMaxHealth * (mutator ? mutator.hullMult : 1));
    const speed = effectiveShip.baseSpeed * (mutator ? mutator.playerSpeedMult : 1);
    const fireRate = effectiveShip.baseFireRate * (mutator ? mutator.fireRateMult : 1);
    const damage = Math.round(effectiveShip.baseDamage * (mutator ? mutator.damageMult : 1));
    const bulletSpeed = effectiveShip.baseBulletSpeed * (mutator && mutator.playerSpeedMult > 1 ? 1.12 : 1);
    const dashCooldown = Math.round(effectiveShip.dashCooldown * (mutator ? mutator.dashCooldownMult : 1));

    this.survivalTime = 0;
    this.score = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.bossesDefeated = 0;
    this.shakeAmount = 0;
    this.remotePlayers = [];
    this.remoteBullets = [];
    this.pendingDropClaims.clear();
    this.onlineDmgAccum.clear();
    this.stateSyncTimer = 0;

    // Reset player position & stats
    this.player.x = this.arenaWidth / 2;
    this.player.y = this.arenaHeight / 2;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.angle = 0;
    this.player.invulnerableTimer = 1000;
    this.player.fireTimer = 0;
    this.player.dashTimer = 0;
    this.player.dashDurationTimer = 0;
    this.player.isDashing = false;

    this.lastKnownPlayerPos = { x: this.player.x, y: this.player.y };
    this.inHidingSpot = false;
    this.isHidden = false;
    this.stealthRevealTimer = 0;
    this.ambushNextShot = false;

    this.orbitingOrbs = [];
    this.player.stats = {
      level: 1,
      xp: 0,
      xpToNextLevel: 35,
      health: maxHealth,
      maxHealth,
      shield: effectiveShip.baseShield,
      maxShield: effectiveShip.baseShield,
      speed,
      fireRate,
      damage,
      bulletSpeed,
      bulletCount: 1,
      critChance: 0.1,
      critMultiplier: 2.2,
      pickupRadius: 95,
      regenRate: 0,
      dashCooldown,
      dashTimer: 0,
      isDashing: false,
      inHidingSpot: false,
      isHidden: false,
      stealthRevealTimer: 0,
      upgrades: {},
    };

    // Clean entities
    this.bullets = [];
    this.enemies = [];
    this.drops = [];
    this.particles = [];
    this.floatingTexts = [];
    this.singularities = [];
    this.shockwaveRings = [];

    if (mode === 'online') {
      this.hidingSpots = [];
      this.setupOnlineMode(effectiveShip, maxHealth);
    } else {
      // Generate tactical Hiding Spots across the arena
      this.generateHidingSpots(mutator ? mutator.hidingSpotCount : 9, 92);
    }

    // Grant Daily Challenge starting module if applicable
    if (this.dailyConfig?.startingUpgradeId) {
      this.applyUpgradeStatOnly(this.dailyConfig.startingUpgradeId);
    }

    this.bossSpawnedStage1 = false;
    this.bossSpawnedStage2 = false;
    this.currentBoss = null;
    this.spawnTimer = 0;
    this.missileTimer = 0;
    this.empTimer = 0;
    this.killsSinceSingularity = 0;

    this.isRunning = true;
    this.isPaused = false;
    this.lastTime = performance.now();

    soundEngine.init();
    soundEngine.setBossMusic(false);
    soundEngine.startMusic(false);

    // Center camera immediately on player
    const viewW = this.canvas.width / (window.devicePixelRatio || 1);
    const viewH = this.canvas.height / (window.devicePixelRatio || 1);
    this.cameraX = this.player.x - viewW / 2;
    this.cameraY = this.player.y - viewH / 2;

    this.callbacks.onStatsUpdate({ ...this.player.stats });
    this.callbacks.onScoreUpdate(this.score, this.kills, Math.floor(this.survivalTime));
    this.callbacks.onBossState(null);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.loop(performance.now());
  }

  private setupOnlineMode(ship: ShipClass, maxHealth: number) {
    this.onlineUnsubscribe = realtimeClient.subscribe({
      onRoomJoined: (payload) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        this.player.x = payload.spawnX;
        this.player.y = payload.spawnY;
        this.lastKnownPlayerPos = { x: payload.spawnX, y: payload.spawnY };
        this.hidingSpots = payload.hidingSpots || [];
        this.addFloatingText(
          this.player.x,
          this.player.y - 40,
          `SQUAD ${payload.roomId} CONNECTED`,
          '#38bdf8',
          16,
          true
        );
      },
      onRoomSnapshot: (snapshot) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        this.survivalTime = snapshot.survivalTime;
        if (Array.isArray(snapshot.hidingSpots) && snapshot.hidingSpots.length > 0) {
          if (this.hidingSpots.length !== snapshot.hidingSpots.length) {
            this.hidingSpots = snapshot.hidingSpots;
          } else {
            for (let i = 0; i < snapshot.hidingSpots.length; i++) {
              this.hidingSpots[i].pulsePhase = snapshot.hidingSpots[i].pulsePhase;
            }
          }
        }

        const myId = realtimeClient.clientId;
        this.remotePlayers = snapshot.players.filter((pl) => pl.id !== myId);
        this.callbacks.onRemotePlayersCount?.(snapshot.players.length);

        // Reconcile server-authoritative enemies with smooth interpolation
        const existingMap = new Map<number, Enemy>();
        for (const e of this.enemies) existingMap.set(e.id, e);
        this.enemies = snapshot.enemies.map((se) => {
          const prev = existingMap.get(se.id);
          if (prev) {
            prev.x += (se.x - prev.x) * 0.55;
            prev.y += (se.y - prev.y) * 0.55;
            prev.vx = se.vx;
            prev.vy = se.vy;
            prev.hp = se.hp;
            prev.maxHp = se.maxHp;
            prev.angle = se.angle;
            prev.attackTimer = se.attackTimer ?? 0;
            prev.isCharging = se.isCharging;
            prev.isBoss = se.isBoss;
            return prev;
          }
          return {
            ...se,
            specialTimer: 0,
          };
        });

        // Reconcile drops (preserve locally magnetized drops)
        const existingDropMap = new Map<number, DropItem>();
        for (const d of this.drops) existingDropMap.set(d.id, d);
        this.drops = snapshot.drops.map((sd) => {
          const prev = existingDropMap.get(sd.id);
          if (prev) {
            return prev;
          }
          return {
            ...sd,
            pulseTimer: Math.random() * Math.PI,
          };
        });

        this.callbacks.onBossState(snapshot.boss);
      },
      onRemoteFire: (_pilotId, bullets) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        for (const b of bullets) {
          this.remoteBullets.push({
            x: b.x,
            y: b.y,
            vx: b.vx,
            vy: b.vy,
            radius: b.radius || 4.5,
            damage: 0,
            isCrit: b.isCrit ? 1 : 0,
            color: b.color || '#38bdf8',
            life: b.life ?? 1.4,
            isEnemy: false,
          });
        }
      },
      onEnemyFire: (bullets) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        for (const b of bullets) {
          this.bullets.push({
            x: b.x,
            y: b.y,
            vx: b.vx,
            vy: b.vy,
            radius: b.radius || 5,
            damage: b.damage || 18,
            isCrit: 0,
            color: b.color || '#ef4444',
            life: b.life ?? 2.4,
            isEnemy: true,
          });
        }
      },
      onRemoteDash: (payload) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        this.addShockwave(payload.x, payload.y, 60, payload.color);
      },
      onRemoteShockwave: (payload) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        this.addShockwave(payload.x, payload.y, payload.radius, payload.color);
        soundEngine.playEmpNova();
      },
      onEnemyKilled: (payload) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        const idx = this.enemies.findIndex((e) => e.id === payload.enemyId);
        if (idx !== -1) {
          this.enemies.splice(idx, 1);
        }
        if (payload.killerId === realtimeClient.clientId) {
          this.kills++;
          this.score += Math.round(payload.xpValue * 1.5);
          if (payload.isBoss) {
            this.bossesDefeated++;
          }
          const singularityLvl = this.player.stats.upgrades['singularity_core'] || 0;
          if (singularityLvl > 0) {
            this.killsSinceSingularity++;
            const threshold = Math.max(5, 13 - singularityLvl * 2);
            if (this.killsSinceSingularity >= threshold) {
              this.killsSinceSingularity = 0;
              this.singularities.push({
                x: payload.x,
                y: payload.y,
                radius: 115 + singularityLvl * 30,
                life: 3.0 + singularityLvl * 0.3,
              });
              this.addShockwave(payload.x, payload.y, 80, '#c084fc');
            }
          }
        }
        if (payload.isBoss) {
          soundEngine.setBossMusic(false);
          soundEngine.playExplosion(2.0);
          this.addScreenShake(16);
        } else if (Math.hypot(payload.x - this.player.x, payload.y - this.player.y) < 750) {
          soundEngine.playSmallExplosion();
        }
        const particleCount = payload.isBoss ? 40 : 10;
        for (let i = 0; i < particleCount; i++) {
          const pAngle = Math.random() * Math.PI * 2;
          const pSpeed = 1 + Math.random() * (payload.isBoss ? 8 : 5);
          this.particles.push({
            x: payload.x,
            y: payload.y,
            vx: Math.cos(pAngle) * pSpeed,
            vy: Math.sin(pAngle) * pSpeed,
            color: payload.color,
            size: 3 + Math.random() * 3,
            alpha: 1,
            decay: 0.04 + Math.random() * 0.04,
            glow: true,
          });
        }
      },
      onDropGranted: (drop) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        this.pendingDropClaims.delete(drop.id);
        this.collectDrop(drop);
      },
      onBossWarning: (bossName) => {
        if (!this.isRunning || this.gameMode !== 'online') return;
        soundEngine.playBossWarning();
        soundEngine.setBossMusic(true);
        this.addScreenShake(15);
        this.addFloatingText(
          this.player.x,
          this.player.y - 100,
          `⚠️ WARNING: ${bossName} DETECTED ⚠️`,
          '#ef4444',
          22,
          true
        );
      },
    });

    realtimeClient.joinRoom({
      roomId: this.onlineRoomId,
      pilotName: this.pilotName,
      shipId: ship.id,
      shipName: ship.name,
      color: ship.color,
      accentColor: ship.accentColor,
      maxHp: maxHealth,
      maxShield: ship.baseShield,
    });
  }

  private queueOnlineDamage(enemyId: number, dmg: number) {
    if (this.gameMode !== 'online' || dmg <= 0) return;
    const prev = this.onlineDmgAccum.get(enemyId) || 0;
    this.onlineDmgAccum.set(enemyId, prev + dmg);
  }

  private generateHidingSpots(count: number, radius: number) {
    this.hidingSpots = [];
    const center = { x: this.arenaWidth / 2, y: this.arenaHeight / 2 };

    // Always place 2 tactical hiding spots near the player's starting view for immediate tactical play
    const nearAngles = [this.layoutRng() * Math.PI * 2, 0];
    nearAngles[1] = nearAngles[0] + Math.PI * (0.8 + this.layoutRng() * 0.4);
    for (let i = 0; i < Math.min(2, count); i++) {
      const dist = 250 + this.layoutRng() * 140;
      this.hidingSpots.push({
        id: this.nextEntityId++,
        x: Math.round(center.x + Math.cos(nearAngles[i]) * dist),
        y: Math.round(center.y + Math.sin(nearAngles[i]) * dist),
        radius,
        pulsePhase: this.layoutRng() * Math.PI * 2,
        compromisedTimer: 0,
      });
    }

    // Scatter remaining hiding spots across the arena with minimum separation
    let attempts = 0;
    while (this.hidingSpots.length < count && attempts < 200) {
      attempts++;
      const margin = 220;
      const x = margin + this.layoutRng() * (this.arenaWidth - margin * 2);
      const y = margin + this.layoutRng() * (this.arenaHeight - margin * 2);

      // Avoid overlapping center spawn or existing hiding spots
      if (Math.hypot(x - center.x, y - center.y) < 180) continue;
      const tooClose = this.hidingSpots.some((s) => Math.hypot(s.x - x, s.y - y) < 360);
      if (tooClose) continue;

      this.hidingSpots.push({
        id: this.nextEntityId++,
        x: Math.round(x),
        y: Math.round(y),
        radius,
        pulsePhase: this.layoutRng() * Math.PI * 2,
        compromisedTimer: 0,
      });
    }
  }

  public pause() {
    this.isPaused = true;
  }

  public resume() {
    if (!this.isRunning) return;
    this.isPaused = false;
    this.lastTime = performance.now();
  }

  public stop() {
    this.isRunning = false;
    if (this.onlineUnsubscribe) {
      this.onlineUnsubscribe();
      this.onlineUnsubscribe = null;
    }
    if (this.gameMode === 'online') {
      realtimeClient.leaveRoom();
    }
    this.remotePlayers = [];
    this.remoteBullets = [];
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    soundEngine.stopMusic();
  }

  // Upgrade Selection Logic
  public getRandomUpgradeOptions(): UpgradeDefinition[] {
    const available = UPGRADE_CATALOG.filter((upg) => {
      const current = this.player.stats.upgrades[upg.id] || 0;
      return current < upg.maxLevel;
    });

    const rng =
      this.gameMode === 'daily' && this.dailyConfig
        ? createSeededRng(`${this.dailyConfig.dateKey}:draft:${this.player.stats.level}`)
        : Math.random;

    // Fisher-Yates shuffle for deterministic seeded drafts
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, 3).map((upg) => ({
      ...upg,
      currentLevel: this.player.stats.upgrades[upg.id] || 0,
    }));
  }

  private applyUpgradeStatOnly(upgradeId: string) {
    const nextLvl = (this.player.stats.upgrades[upgradeId] || 0) + 1;
    this.player.stats.upgrades[upgradeId] = nextLvl;
    const isMaxLvl5 = nextLvl === 5;

    switch (upgradeId) {
      case 'pulse_split':
        this.player.stats.bulletCount += 1;
        this.player.stats.fireRate *= isMaxLvl5 ? 1.2 : 1.1;
        break;
      case 'orbit_nanites':
        this.addOrbitingNanite(isMaxLvl5);
        break;
      case 'shield_booster':
        this.player.stats.maxShield += 30;
        this.player.stats.shield = isMaxLvl5
          ? this.player.stats.maxShield
          : Math.min(this.player.stats.shield + 30, this.player.stats.maxShield);
        break;
      case 'hull_plating':
        this.player.stats.maxHealth += 35;
        this.player.stats.health = isMaxLvl5
          ? this.player.stats.maxHealth
          : Math.min(this.player.stats.health + 35, this.player.stats.maxHealth);
        break;
      case 'hull_regen':
        this.player.stats.regenRate += isMaxLvl5 ? 7.5 : 2.5;
        break;
      case 'quantum_magnet':
        this.player.stats.pickupRadius += 55;
        break;
      case 'overdrive_thrusters':
        this.player.stats.speed *= 1.15;
        this.player.stats.dashCooldown = Math.max(
          isMaxLvl5 ? 900 : 1200,
          this.player.stats.dashCooldown * 0.85
        );
        break;
      case 'crit_matrix':
        this.player.stats.critChance += isMaxLvl5 ? 0.27 : 0.12;
        this.player.stats.critMultiplier += isMaxLvl5 ? 1.2 : 0.4;
        break;
      case 'overclock_ammo':
        this.player.stats.damage *= 1.22;
        this.player.stats.bulletSpeed *= 1.15;
        break;
      case 'stealth_cloak':
        this.player.stats.shield = Math.min(this.player.stats.shield + 20, this.player.stats.maxShield);
        break;
      default:
        break;
    }

    if (isMaxLvl5) {
      this.addFloatingText(this.player.x, this.player.y - 36, 'LVL 5 OVERDRIVE!', '#fbbf24', 20, true);
      this.addShockwave(this.player.x, this.player.y, 120, '#fbbf24');
    }
  }

  public applyUpgrade(upgradeId: string) {
    this.applyUpgradeStatOnly(upgradeId);
    this.callbacks.onStatsUpdate({ ...this.player.stats });
    this.resume();
  }

  private addOrbitingNanite(isMaxLvl5 = false) {
    const count = this.orbitingOrbs.length + 1;
    const isOverdrive = isMaxLvl5 || (this.player.stats.upgrades['orbit_nanites'] || 0) >= 5;
    this.orbitingOrbs = [];
    for (let i = 0; i < count; i++) {
      this.orbitingOrbs.push({
        angle: (i / count) * Math.PI * 2,
        distance: isOverdrive ? 88 : 75,
        radius: isOverdrive ? 12 : 8,
        damage: (18 + count * 5) * (isOverdrive ? 1.4 : 1),
        color: isOverdrive ? '#fbbf24' : '#38bdf8',
      });
    }
  }

  // Dash Action
  public triggerDash() {
    if (this.player.dashTimer > 0 || this.player.isDashing) return;

    // Movement direction or aim direction
    let dirX = 0;
    let dirY = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) dirY -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) dirY += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) dirX -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) dirX += 1;

    if (dirX === 0 && dirY === 0) {
      dirX = Math.cos(this.player.angle);
      dirY = Math.sin(this.player.angle);
    } else {
      const len = Math.hypot(dirX, dirY);
      dirX /= len;
      dirY /= len;
    }

    this.player.isDashing = true;
    this.player.dashTimer = this.player.stats.dashCooldown;
    this.player.dashDurationTimer = this.selectedShip.dashDuration;
    this.player.invulnerableTimer = Math.max(this.player.invulnerableTimer, this.selectedShip.dashDuration + 50);

    const dashSpeed = this.player.stats.speed * this.selectedShip.dashSpeedMult;
    this.player.vx = dirX * dashSpeed;
    this.player.vy = dirY * dashSpeed;

    soundEngine.playDash();
    this.addShockwave(this.player.x, this.player.y, 60, this.selectedShip.accentColor);

    if (this.gameMode === 'online') {
      realtimeClient.send(
        { type: 'player:dash', x: Math.round(this.player.x), y: Math.round(this.player.y) },
        false
      );
    }

    // Chrono special rift
    if (this.selectedShip.id === 'chrono') {
      this.singularities.push({
        x: this.player.x,
        y: this.player.y,
        radius: 90,
        life: 2.5,
      });
    }
  }

  private loop = (time: number) => {
    if (!this.isRunning) return;

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (!this.isPaused) {
      this.update(dt);
    }
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    if (this.gameMode !== 'online') {
      this.survivalTime += dt;
    }

    // Update hiding spots animation & compromised flash
    for (const spot of this.hidingSpots) {
      spot.pulsePhase += dt * 2.5;
      if (spot.compromisedTimer > 0) {
        spot.compromisedTimer = Math.max(0, spot.compromisedTimer - dt);
      }
    }

    // Trigger Boss Encounters (offline modes)
    if (this.gameMode === 'survivor') {
      if (this.survivalTime >= 180 && !this.bossSpawnedStage1) {
        this.spawnBoss('boss_goliath');
        this.bossSpawnedStage1 = true;
      } else if (this.survivalTime >= 360 && !this.bossSpawnedStage2) {
        this.spawnBoss('boss_nexus');
        this.bossSpawnedStage2 = true;
      } else if (this.survivalTime >= 600 && this.bossesDefeated >= 2) {
        this.handleVictory();
        return;
      }
    } else if (this.gameMode === 'daily' && this.dailyConfig) {
      if (this.survivalTime >= this.nextDailyBossTime && !this.currentBoss) {
        const bossType = this.dailyBossCount % 2 === 0 ? 'boss_goliath' : 'boss_nexus';
        this.dailyBossCount++;
        this.nextDailyBossTime = this.survivalTime + this.dailyConfig.mutator.bossInterval;
        this.spawnBoss(bossType);
      }
    } else if (this.gameMode === 'endless') {
      // Endless mode: spawn bosses periodically
      if (this.survivalTime > 180 && Math.floor(this.survivalTime) % 180 === 0 && !this.currentBoss) {
        this.spawnBoss(Math.random() > 0.5 ? 'boss_goliath' : 'boss_nexus');
      }
    }

    // Update Player Movement & Controls
    this.updatePlayer(dt);

    // Update Weapons & Shooting
    this.updateWeapons(dt);

    // Update Systems
    this.updateOrbitingOrbs(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    if (this.gameMode !== 'online') {
      this.updateSpawning(dt);
    }
    this.updateDrops(dt);
    this.updateSingularities(dt);
    this.updateParticles(dt);
    this.updateFloatingTexts(dt);

    // Sync state & batched damage in Online Co-op mode at 20Hz
    if (this.gameMode === 'online') {
      this.stateSyncTimer += dt;
      if (this.stateSyncTimer >= 0.05) {
        this.stateSyncTimer = 0;
        const p = this.player;
        realtimeClient.send(
          {
            type: 'player:state',
            x: Math.round(p.x),
            y: Math.round(p.y),
            angle: Number(p.angle.toFixed(3)),
            hp: Math.round(p.stats.health),
            maxHp: Math.round(p.stats.maxHealth),
            shield: Math.round(p.stats.shield),
            maxShield: Math.round(p.stats.maxShield),
            isHidden: this.isHidden,
            isDashing: p.isDashing,
            level: p.stats.level,
            score: this.score,
            kills: this.kills,
          },
          false
        );

        if (this.onlineDmgAccum.size > 0) {
          for (const [enemyId, totalDmg] of this.onlineDmgAccum.entries()) {
            const rounded = Math.round(totalDmg);
            if (rounded > 0) {
              realtimeClient.send({ type: 'enemy:damage', enemyId, damage: rounded }, false);
            }
          }
          this.onlineDmgAccum.clear();
        }
      }
    }

    // Update Camera & Screen Shake
    this.updateCamera(dt);

    // Notify React of periodic updates
    this.callbacks.onScoreUpdate(this.score, this.kills, Math.floor(this.survivalTime));
  }

  private updatePlayer(dt: number) {
    const p = this.player;

    // Movement keys
    let moveX = 0;
    let moveY = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) moveY -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) moveY += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) moveX -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) moveX += 1;

    // Normalize
    const mag = Math.hypot(moveX, moveY);
    if (mag > 0 && !p.isDashing) {
      moveX /= mag;
      moveY /= mag;
      p.vx = moveX * p.stats.speed;
      p.vy = moveY * p.stats.speed;

      // Thruster particles
      if (Math.random() < 0.4) {
        const backAngle = p.angle + Math.PI + (Math.random() - 0.5) * 0.5;
        this.particles.push({
          x: p.x - Math.cos(p.angle) * 16,
          y: p.y - Math.sin(p.angle) * 16,
          vx: Math.cos(backAngle) * (2 + Math.random() * 3),
          vy: Math.sin(backAngle) * (2 + Math.random() * 3),
          color: this.selectedShip.accentColor,
          size: 3.5,
          alpha: 0.8,
          decay: 0.05,
          glow: true,
        });
      }
    } else if (!p.isDashing) {
      p.vx *= 0.82;
      p.vy *= 0.82;
    }

    // Apply Velocity
    p.x += p.vx;
    p.y += p.vy;

    // Arena boundary clamp
    p.x = Math.max(p.radius + 20, Math.min(this.arenaWidth - p.radius - 20, p.x));
    p.y = Math.max(p.radius + 20, Math.min(this.arenaHeight - p.radius - 20, p.y));

    // Dash Duration & Cooldown
    if (p.dashTimer > 0) {
      p.dashTimer -= dt * 1000;
    }
    if (p.isDashing) {
      p.dashDurationTimer -= dt * 1000;
      // Dash ghosting
      p.dashTrailTimer -= dt * 1000;
      if (p.dashTrailTimer <= 0) {
        p.dashTrailTimer = 35;
        this.particles.push({
          x: p.x,
          y: p.y,
          vx: 0,
          vy: 0,
          color: this.selectedShip.color,
          size: p.radius,
          alpha: 0.5,
          decay: 0.08,
        });
      }
      if (p.dashDurationTimer <= 0) {
        p.isDashing = false;
        p.vx *= 0.3;
        p.vy *= 0.3;
      }
    }

    // Aim Angle
    if (this.autoFireEnabled && this.enemies.length > 0) {
      // Find closest enemy
      let closestDist = Infinity;
      let targetX = this.mouse.worldX;
      let targetY = this.mouse.worldY;

      for (const enemy of this.enemies) {
        const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (d < closestDist && d < 650) {
          closestDist = d;
          targetX = enemy.x;
          targetY = enemy.y;
        }
      }
      const targetAngle = Math.atan2(targetY - p.y, targetX - p.x);
      // Smooth rotate towards target
      let diff = targetAngle - p.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      p.angle += diff * 0.3;
    } else {
      p.angle = Math.atan2(this.mouse.worldY - p.y, this.mouse.worldX - p.x);
    }

    // Invulnerability timer
    if (p.invulnerableTimer > 0) {
      p.invulnerableTimer -= dt * 1000;
    }

    // Hiding Spot & Stealth Detection
    const activeSpot = this.hidingSpots.find(
      (s) => Math.hypot(p.x - s.x, p.y - s.y) <= s.radius - 6
    );
    const wasHidden = this.isHidden;
    this.inHidingSpot = Boolean(activeSpot);
    if (this.stealthRevealTimer > 0) {
      this.stealthRevealTimer = Math.max(0, this.stealthRevealTimer - dt * 1000);
    }
    this.isHidden = this.inHidingSpot && this.stealthRevealTimer <= 0 && !p.isDashing;

    if (!wasHidden && this.isHidden) {
      this.addFloatingText(p.x, p.y - 26, 'CLOAK ENGAGED', '#10b981', 14, true);
    }

    if (!this.isHidden) {
      this.lastKnownPlayerPos = { x: p.x, y: p.y };
    }

    const stealthLvl = p.stats.upgrades['stealth_cloak'] || 0;
    const shieldBoosterLvl = p.stats.upgrades['shield_booster'] || 0;

    // Shield Recharge (bypasses recharge delay and boosts rate inside hiding spots)
    p.shieldRechargeTimer += dt * 1000;
    if (this.isHidden || p.shieldRechargeTimer >= this.selectedShip.shieldRechargeDelay) {
      if (p.stats.shield < p.stats.maxShield) {
        const stealthBoost = this.isHidden ? 1.6 * (1 + stealthLvl * 0.45) : 1;
        const boosterMult = shieldBoosterLvl >= 5 ? 2.0 : 1 + shieldBoosterLvl * 0.15;
        const rechargeAmount = this.selectedShip.shieldRechargeRate * stealthBoost * boosterMult * dt;
        p.stats.shield = Math.min(p.stats.maxShield, p.stats.shield + rechargeAmount);
      }
    }

    // Passive Hull Regen + Hiding Spot Stealth Repair
    const stealthHullRepair = this.isHidden && stealthLvl > 0 ? stealthLvl * 1.4 : 0;
    const totalRegen = p.stats.regenRate + stealthHullRepair;
    if (totalRegen > 0 && p.stats.health < p.stats.maxHealth) {
      p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + totalRegen * dt);
    }

    // Feed stats to player.stats object
    p.stats.dashTimer = Math.max(0, p.dashTimer);
    p.stats.isDashing = p.isDashing;
    p.stats.inHidingSpot = this.inHidingSpot;
    p.stats.isHidden = this.isHidden;
    p.stats.stealthRevealTimer = this.stealthRevealTimer;
    this.callbacks.onStatsUpdate({ ...p.stats });
  }

  private updateWeapons(dt: number) {
    const p = this.player;
    const stealthLvl = p.stats.upgrades['stealth_cloak'] || 0;

    // Primary Blasters
    p.fireTimer += dt;
    const fireInterval = 1 / p.stats.fireRate;
    // When hidden inside a hiding spot, hold auto-fire so you stay cloaked; manual click triggers an Ambush shot!
    const shouldFire = this.isHidden
      ? this.mouse.isDown
      : this.autoFireEnabled || this.mouse.isDown;

    if (shouldFire && p.fireTimer >= fireInterval) {
      p.fireTimer = 0;
      if (this.isHidden) {
        this.ambushNextShot = true;
        // At LVL 5 Phantom Cloaking Matrix, suppressed shots stay cloaked!
        if (stealthLvl < 5) {
          this.stealthRevealTimer = Math.max(350, 1100 - stealthLvl * 175);
          this.isHidden = false;
        }
      }
      this.firePrimaryCannons();
    }

    // Homing Missiles Upgrade (paused while hidden so missiles don't blow cover)
    const missileLvl = p.stats.upgrades['homing_missiles'] || 0;
    if (missileLvl > 0 && !this.isHidden) {
      this.missileTimer += dt;
      if (this.missileTimer >= Math.max(1.1, 2.6 - missileLvl * 0.3)) {
        this.missileTimer = 0;
        this.fireHomingMissiles(missileLvl + 1);
      }
    }

    // EMP Nova Upgrade (paused while hidden)
    const empLvl = p.stats.upgrades['emp_nova'] || 0;
    if (empLvl > 0 && !this.isHidden) {
      this.empTimer += dt;
      if (this.empTimer >= Math.max(3.0, 6.5 - empLvl * 0.7)) {
        this.empTimer = 0;
        this.triggerEmpNova(empLvl);
      }
    }
  }

  private firePrimaryCannons() {
    const p = this.player;
    const count = p.stats.bulletCount;
    const spread = 0.15; // radians spread
    const startAngle = p.angle - ((count - 1) * spread) / 2;
    const isAmbush = this.ambushNextShot;
    this.ambushNextShot = false;
    const stealthLvl = p.stats.upgrades['stealth_cloak'] || 0;
    const pulseLvl = p.stats.upgrades['pulse_split'] || 0;
    const ammoLvl = p.stats.upgrades['overclock_ammo'] || 0;
    const dailyAmbushBonus = this.dailyConfig ? this.dailyConfig.mutator.ambushBonus : 0;
    const ambushMult = isAmbush ? 1.5 + stealthLvl * 0.35 + dailyAmbushBonus : 1;
    const pierceCount = ammoLvl >= 5 ? 2 : 0;

    if (isAmbush) {
      this.addFloatingText(p.x, p.y - 24, 'AMBUSH CRIT!', '#10b981', 16, true);
    }

    const networkBullets: RemoteBulletPayload[] = [];

    for (let i = 0; i < count; i++) {
      const angle = startAngle + i * spread;
      const isCrit = isAmbush || this.combatRng() < p.stats.critChance;
      const dmg = Math.round(p.stats.damage * (isCrit ? p.stats.critMultiplier : 1) * ambushMult);
      const bx = p.x + Math.cos(p.angle) * 18;
      const by = p.y + Math.sin(p.angle) * 18;
      const bvx = Math.cos(angle) * p.stats.bulletSpeed;
      const bvy = Math.sin(angle) * p.stats.bulletSpeed;
      const radius = isAmbush ? 7 : isCrit ? 6 : 4.5;
      const color = isAmbush ? '#10b981' : isCrit ? '#f59e0b' : this.selectedShip.accentColor;

      this.bullets.push({
        x: bx,
        y: by,
        vx: bvx,
        vy: bvy,
        radius,
        damage: dmg,
        isCrit: isCrit ? 1 : 0,
        color,
        life: 1.8,
        isEnemy: false,
        pierce: pierceCount,
        hitEnemyIds: pierceCount > 0 ? new Set<number>() : undefined,
      });

      if (this.gameMode === 'online') {
        networkBullets.push({
          x: Math.round(bx),
          y: Math.round(by),
          vx: Number(bvx.toFixed(2)),
          vy: Number(bvy.toFixed(2)),
          radius,
          damage: dmg,
          isCrit: isCrit ? 1 : 0,
          color,
          life: 1.5,
        });
      }
    }

    // LVL 5 Multi-Vector Cannons bonus: twin rear-guard blasters
    if (pulseLvl >= 5) {
      for (const offset of [Math.PI - 0.22, Math.PI + 0.22]) {
        const angle = p.angle + offset;
        const bx = p.x + Math.cos(angle) * 14;
        const by = p.y + Math.sin(angle) * 14;
        const bvx = Math.cos(angle) * p.stats.bulletSpeed;
        const bvy = Math.sin(angle) * p.stats.bulletSpeed;
        this.bullets.push({
          x: bx,
          y: by,
          vx: bvx,
          vy: bvy,
          radius: 4.5,
          damage: Math.round(p.stats.damage * 0.85),
          isCrit: 0,
          color: '#fbbf24',
          life: 1.5,
          isEnemy: false,
          pierce: pierceCount,
          hitEnemyIds: pierceCount > 0 ? new Set<number>() : undefined,
        });
        if (this.gameMode === 'online') {
          networkBullets.push({
            x: Math.round(bx),
            y: Math.round(by),
            vx: Number(bvx.toFixed(2)),
            vy: Number(bvy.toFixed(2)),
            radius: 4.5,
            damage: 0,
            isCrit: 0,
            color: '#fbbf24',
            life: 1.2,
          });
        }
      }
    }

    if (this.gameMode === 'online' && networkBullets.length > 0) {
      realtimeClient.send({ type: 'player:fire', bullets: networkBullets }, false);
    }

    soundEngine.playLaser(1 + (Math.random() - 0.5) * 0.2);
  }

  private fireHomingMissiles(count: number) {
    const p = this.player;
    soundEngine.playMissile();

    for (let i = 0; i < count; i++) {
      const angle = p.angle + (i === 0 ? -0.8 : 0.8) + (Math.random() - 0.5) * 0.3;
      this.bullets.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * 6,
        vy: Math.sin(angle) * 6,
        radius: 6,
        damage: Math.round(p.stats.damage * 2.4),
        isCrit: 1,
        color: '#ef4444',
        life: 3.5,
        isHoming: true,
        isEnemy: false,
      });
    }
  }

  private triggerEmpNova(level: number) {
    const p = this.player;
    const radius = 220 + level * 55;
    const damage = 60 + level * 30;

    soundEngine.playEmpNova();
    this.addScreenShake(8);
    this.addShockwave(p.x, p.y, radius, level >= 5 ? '#fbbf24' : '#06b6d4');

    // Affect all enemies within radius
    for (const enemy of this.enemies) {
      const dist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (dist <= radius) {
        enemy.hp -= damage;
        this.damageDealt += damage;
        this.queueOnlineDamage(enemy.id, damage);
        this.addFloatingText(enemy.x, enemy.y, `${damage}`, '#06b6d4', 18, true);

        // Knockback
        const kAngle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
        enemy.vx = Math.cos(kAngle) * 8;
        enemy.vy = Math.sin(kAngle) * 8;
      }
    }

    // LVL 5 Vortex EMP Blast Overdrive: vaporize enemy projectiles inside blast
    if (level >= 5) {
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        if (b.isEnemy && Math.hypot(b.x - p.x, b.y - p.y) <= radius) {
          this.bullets.splice(i, 1);
        }
      }
    }
  }

  private updateOrbitingOrbs(dt: number) {
    const p = this.player;
    const orbLvl = p.stats.upgrades['orbit_nanites'] || 0;
    const spinSpeed = orbLvl >= 5 ? 5.3 : 3.8 + orbLvl * 0.25;
    for (const orb of this.orbitingOrbs) {
      orb.angle += dt * spinSpeed;
      const orbX = p.x + Math.cos(orb.angle) * orb.distance;
      const orbY = p.y + Math.sin(orb.angle) * orb.distance;

      // Check enemy collisions
      for (const enemy of this.enemies) {
        const dist = Math.hypot(enemy.x - orbX, enemy.y - orbY);
        if (dist <= enemy.radius + orb.radius) {
          const dmg = orb.damage * dt;
          enemy.hp -= dmg;
          this.damageDealt += dmg;
          this.queueOnlineDamage(enemy.id, dmg);

          if (Math.random() < 0.2) {
            this.addFloatingText(enemy.x, enemy.y, `${Math.round(orb.damage)}`, '#38bdf8', 14);
            soundEngine.playShieldHit();
          }

          // Sparks
          this.particles.push({
            x: orbX,
            y: orbY,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            color: orb.color,
            size: 3,
            alpha: 0.9,
            decay: 0.1,
          });
        }
      }
    }
  }

  private updateBullets(dt: number) {
    const p = this.player;

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;

      if (b.life <= 0) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Homing physics
      if (b.isHoming && this.enemies.length > 0) {
        let closest: Enemy | null = null;
        let minD = Infinity;
        for (const e of this.enemies) {
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < minD) {
            minD = d;
            closest = e;
          }
        }
        if (closest) {
          const targetAngle = Math.atan2(closest.y - b.y, closest.x - b.x);
          const currentAngle = Math.atan2(b.vy, b.vx);
          let diff = targetAngle - currentAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          const newAngle = currentAngle + diff * 0.12;
          const spd = Math.hypot(b.vx, b.vy) + dt * 10;
          b.vx = Math.cos(newAngle) * spd;
          b.vy = Math.sin(newAngle) * spd;

          // Smoke trail
          this.particles.push({
            x: b.x,
            y: b.y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            color: '#f87171',
            size: 3.5,
            alpha: 0.7,
            decay: 0.08,
          });
        }
      }

      b.x += b.vx;
      b.y += b.vy;

      // Check collision with Player (if enemy bullet)
      if (b.isEnemy) {
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d <= p.radius + b.radius) {
          this.damagePlayer(b.damage);
          this.bullets.splice(i, 1);
          continue;
        }
      } else {
        // Player bullet vs Enemies
        let destroyBullet = false;
        for (const enemy of this.enemies) {
          if (b.hitEnemyIds?.has(enemy.id)) continue;
          const dist = Math.hypot(enemy.x - b.x, enemy.y - b.y);
          if (dist <= enemy.radius + b.radius) {
            enemy.hp -= b.damage;
            this.damageDealt += b.damage;
            this.queueOnlineDamage(enemy.id, b.damage);
            b.hitEnemyIds?.add(enemy.id);

            // Damage float
            this.addFloatingText(
              enemy.x,
              enemy.y,
              b.isCrit ? `${b.damage}!` : `${b.damage}`,
              b.isCrit ? '#fbbf24' : '#ffffff',
              b.isCrit ? 18 : 14,
              !!b.isCrit
            );

            // Arc lightning trigger (LVL 5 boosts proc rate to 85%)
            const arcLvl = p.stats.upgrades['arc_lightning'] || 0;
            const arcChance = arcLvl >= 5 ? 0.85 : 0.45;
            if (arcLvl > 0 && this.combatRng() < arcChance) {
              this.triggerArcLightning(enemy, arcLvl);
            }

            // Hit sparks
            for (let s = 0; s < 4; s++) {
              this.particles.push({
                x: b.x,
                y: b.y,
                vx: -b.vx * 0.2 + (Math.random() - 0.5) * 4,
                vy: -b.vy * 0.2 + (Math.random() - 0.5) * 4,
                color: b.color,
                size: 2.5,
                alpha: 0.9,
                decay: 0.09,
              });
            }

            if (b.isHoming) {
              // AoE blast for rocket (LVL 5 expanded radius)
              const missileLvl = p.stats.upgrades['homing_missiles'] || 0;
              const splashRadius = missileLvl >= 5 ? 100 : 65;
              soundEngine.playSmallExplosion();
              this.addShockwave(b.x, b.y, splashRadius * 0.7, '#ef4444');
              for (const splashEnemy of this.enemies) {
                if (splashEnemy !== enemy) {
                  const sDist = Math.hypot(splashEnemy.x - b.x, splashEnemy.y - b.y);
                  if (sDist <= splashRadius) {
                    const splashDmg = Math.round(b.damage * 0.6);
                    splashEnemy.hp -= splashDmg;
                    this.queueOnlineDamage(splashEnemy.id, splashDmg);
                  }
                }
              }
            }

            if (b.pierce && b.pierce > 0) {
              b.pierce--;
            } else {
              destroyBullet = true;
              break;
            }
          }
        }

        if (destroyBullet) {
          this.bullets.splice(i, 1);
        }
      }
    }

    // Update cosmetic remote bullets from squadmates
    for (let i = this.remoteBullets.length - 1; i >= 0; i--) {
      const rb = this.remoteBullets[i];
      rb.life -= dt;
      rb.x += rb.vx;
      rb.y += rb.vy;
      if (rb.life <= 0) {
        this.remoteBullets.splice(i, 1);
      }
    }
  }

  private triggerArcLightning(originEnemy: Enemy, level: number) {
    const maxTargets = 1 + level;
    const chainRange = level >= 5 ? 240 : 160;
    let chained = 0;
    const targets: Enemy[] = [];

    for (const other of this.enemies) {
      if (other === originEnemy) continue;
      const d = Math.hypot(other.x - originEnemy.x, other.y - originEnemy.y);
      if (d < chainRange) {
        targets.push(other);
        chained++;
        if (chained >= maxTargets) break;
      }
    }

    if (targets.length > 0) {
      soundEngine.playLightningArc();
      const chainDmg = 25 + level * 15;
      for (const target of targets) {
        target.hp -= chainDmg;
        this.damageDealt += chainDmg;
        this.queueOnlineDamage(target.id, chainDmg);
        this.addFloatingText(target.x, target.y, `⚡${chainDmg}`, '#38bdf8', 15);

        // Draw lightning spark particles between them
        const steps = 6;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const lx = originEnemy.x + (target.x - originEnemy.x) * t + (Math.random() - 0.5) * 16;
          const ly = originEnemy.y + (target.y - originEnemy.y) * t + (Math.random() - 0.5) * 16;
          this.particles.push({
            x: lx,
            y: ly,
            vx: 0,
            vy: 0,
            color: '#38bdf8',
            size: 3,
            alpha: 0.9,
            decay: 0.12,
            glow: true,
          });
        }
      }
    }
  }

  private updateEnemies(dt: number) {
    const p = this.player;

    if (this.gameMode === 'online') {
      const frameStep = dt * 60;
      for (const e of this.enemies) {
        const distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);
        if (this.isHidden && distToPlayer <= 52) {
          this.stealthRevealTimer = 1500;
          this.isHidden = false;
          const spot = this.hidingSpots.find((s) => Math.hypot(p.x - s.x, p.y - s.y) <= s.radius);
          if (spot) spot.compromisedTimer = 1.5;
          this.addFloatingText(p.x, p.y - 26, 'SPOTTED!', '#f59e0b', 16, true);
        }
        e.x = Math.max(30, Math.min(this.arenaWidth - 30, e.x + e.vx * frameStep));
        e.y = Math.max(30, Math.min(this.arenaHeight - 30, e.y + e.vy * frameStep));
        if (distToPlayer <= p.radius + e.radius) {
          this.damagePlayer(e.damage);
        }
      }
      return;
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      // Check death
      if (e.hp <= 0) {
        this.killEnemy(e);
        this.enemies.splice(i, 1);
        continue;
      }

      // Check distance to player for close proximity reveal
      const distToPlayer = Math.hypot(p.x - e.x, p.y - e.y);

      if (this.isHidden) {
        if (distToPlayer <= 52) {
          // Enemy stumbled into hiding spot close enough to spot player!
          this.stealthRevealTimer = 1500;
          this.isHidden = false;
          const spot = this.hidingSpots.find((s) => Math.hypot(p.x - s.x, p.y - s.y) <= s.radius);
          if (spot) spot.compromisedTimer = 1.5;
          this.addFloatingText(p.x, p.y - 26, 'SPOTTED!', '#f59e0b', 16, true);
        } else {
          // Patrol / investigate last known position instead of locking directly onto player
          const distToLastKnown = Math.hypot(this.lastKnownPlayerPos.x - e.x, this.lastKnownPlayerPos.y - e.y);
          if (distToLastKnown > 75) {
            const seekAngle = Math.atan2(this.lastKnownPlayerPos.y - e.y, this.lastKnownPlayerPos.x - e.x);
            e.angle = seekAngle;
            e.vx = Math.cos(seekAngle) * e.speed * 0.65;
            e.vy = Math.sin(seekAngle) * e.speed * 0.65;
          } else {
            e.patrolTimer = (e.patrolTimer ?? 0) - dt;
            if ((e.patrolTimer ?? 0) <= 0 || e.patrolAngle === undefined) {
              e.patrolAngle = Math.random() * Math.PI * 2;
              e.patrolTimer = 1.2 + Math.random() * 1.4;
            }
            e.angle = e.patrolAngle;
            e.vx = Math.cos(e.patrolAngle) * e.speed * 0.45;
            e.vy = Math.sin(e.patrolAngle) * e.speed * 0.45;
          }

          if (e.type === 'sniper') {
            // Break sniper laser lock
            e.attackTimer = Math.min(e.attackTimer, 0.7);
          }

          if (e.isBoss) {
            this.callbacks.onBossState({
              name: e.type === 'boss_nexus' ? 'OVERMIND NEXUS CORE' : 'TITAN CARRIER: GOLIATH',
              hp: Math.max(0, e.hp),
              maxHp: e.maxHp,
            });
          }

          e.x += e.vx;
          e.y += e.vy;
          continue;
        }
      }

      // Enemy AI behaviors (Player Visible)
      const angleToPlayer = Math.atan2(p.y - e.y, p.x - e.x);

      switch (e.type) {
        case 'drone':
        case 'swarmer': {
          e.angle = angleToPlayer;
          e.vx = Math.cos(angleToPlayer) * e.speed;
          e.vy = Math.sin(angleToPlayer) * e.speed;
          break;
        }

        case 'weaver': {
          e.specialTimer += dt * 4;
          const sideOffset = Math.sin(e.specialTimer) * 1.5;
          const weaveAngle = angleToPlayer + sideOffset;
          e.angle = angleToPlayer;
          e.vx = Math.cos(weaveAngle) * e.speed;
          e.vy = Math.sin(weaveAngle) * e.speed;
          break;
        }

        case 'brute': {
          e.attackTimer += dt;
          if (e.isCharging) {
            e.specialTimer -= dt;
            if (e.specialTimer <= 0) {
              e.isCharging = false;
              e.speed = 2.4;
            }
          } else if (e.attackTimer >= 3.5 && distToPlayer < 280) {
            // Initiate charge
            e.attackTimer = 0;
            e.isCharging = true;
            e.specialTimer = 0.8; // charge duration
            e.speed = 8.5;
            e.angle = angleToPlayer;
            e.vx = Math.cos(angleToPlayer) * e.speed;
            e.vy = Math.sin(angleToPlayer) * e.speed;
            this.addShockwave(e.x, e.y, 40, '#f97316');
          } else {
            e.angle = angleToPlayer;
            e.vx = Math.cos(angleToPlayer) * e.speed;
            e.vy = Math.sin(angleToPlayer) * e.speed;
          }
          break;
        }

        case 'sniper': {
          e.angle = angleToPlayer;
          e.attackTimer += dt;

          if (distToPlayer < 240) {
            // Back away if player gets too close
            e.vx = -Math.cos(angleToPlayer) * e.speed;
            e.vy = -Math.sin(angleToPlayer) * e.speed;
          } else if (distToPlayer > 420) {
            e.vx = Math.cos(angleToPlayer) * e.speed;
            e.vy = Math.sin(angleToPlayer) * e.speed;
          } else {
            e.vx *= 0.8;
            e.vy *= 0.8;
          }

          // Fire sniper bolt
          if (e.attackTimer >= 2.8) {
            e.attackTimer = 0;
            this.bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(angleToPlayer) * 11,
              vy: Math.sin(angleToPlayer) * 11,
              radius: 5,
              damage: e.damage * 1.5,
              isCrit: 0,
              color: '#ef4444',
              life: 2.2,
              isEnemy: true,
            });
            soundEngine.playLaser(0.7);
          }
          break;
        }

        case 'boss_goliath': {
          e.angle = angleToPlayer;
          e.vx = Math.cos(angleToPlayer) * e.speed;
          e.vy = Math.sin(angleToPlayer) * e.speed;
          e.attackTimer += dt;

          // Radial bullet spiral attack
          if (e.attackTimer >= 2.4) {
            e.attackTimer = 0;
            const rings = 12;
            for (let r = 0; r < rings; r++) {
              const bAngle = (r / rings) * Math.PI * 2 + this.survivalTime;
              this.bullets.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(bAngle) * 5.5,
                vy: Math.sin(bAngle) * 5.5,
                radius: 6.5,
                damage: 22,
                isCrit: 0,
                color: '#ec4899',
                life: 3.5,
                isEnemy: true,
              });
            }
            soundEngine.playSmallExplosion();
          }

          this.callbacks.onBossState({
            name: 'TITAN CARRIER: GOLIATH',
            hp: Math.max(0, e.hp),
            maxHp: e.maxHp,
          });
          break;
        }

        case 'boss_nexus': {
          e.angle += dt * 1.2;
          e.vx = Math.cos(angleToPlayer) * e.speed;
          e.vy = Math.sin(angleToPlayer) * e.speed;
          e.attackTimer += dt;

          // Double wave attack
          if (e.attackTimer >= 1.9) {
            e.attackTimer = 0;
            const rings = 16;
            for (let r = 0; r < rings; r++) {
              const bAngle = (r / rings) * Math.PI * 2 + e.angle;
              this.bullets.push({
                x: e.x,
                y: e.y,
                vx: Math.cos(bAngle) * 6.2,
                vy: Math.sin(bAngle) * 6.2,
                radius: 7,
                damage: 28,
                isCrit: 0,
                color: '#a855f7',
                life: 3.5,
                isEnemy: true,
              });
            }
            soundEngine.playEmpNova();
          }

          this.callbacks.onBossState({
            name: 'OVERMIND NEXUS CORE',
            hp: Math.max(0, e.hp),
            maxHp: e.maxHp,
          });
          break;
        }
      }

      // Move enemy
      e.x += e.vx;
      e.y += e.vy;

      // Push back against player collision
      if (distToPlayer <= p.radius + e.radius) {
        this.damagePlayer(e.damage);

        // Repel enemy
        e.x -= Math.cos(angleToPlayer) * 15;
        e.y -= Math.sin(angleToPlayer) * 15;
      }
    }
  }

  private updateSpawning(dt: number) {
    this.spawnTimer += dt;

    // Difficulty scaling: spawn rate increases with survival time
    const timeMins = this.survivalTime / 60;
    const spawnMult = this.dailyConfig ? this.dailyConfig.mutator.spawnRateMult : 1;
    const baseSpawnRate = Math.max(0.22, (1.3 - timeMins * 0.18) * spawnMult);
    const maxEnemies = Math.min(200, 35 + Math.floor(this.survivalTime * 0.5));

    if (this.spawnTimer >= baseSpawnRate && this.enemies.length < maxEnemies) {
      this.spawnTimer = 0;
      this.spawnWave();
    }
  }

  private spawnWave() {
    const p = this.player;
    const count = 1 + Math.floor(this.waveRng() * (1 + this.survivalTime / 45));

    for (let i = 0; i < count; i++) {
      // Pick seeded/random angle outside screen
      const angle = this.waveRng() * Math.PI * 2;
      const dist = 750 + this.waveRng() * 200;
      const x = Math.max(50, Math.min(this.arenaWidth - 50, p.x + Math.cos(angle) * dist));
      const y = Math.max(50, Math.min(this.arenaHeight - 50, p.y + Math.sin(angle) * dist));

      // Determine type based on survival time
      const rand = this.waveRng();
      let type: Enemy['type'] = 'drone';

      if (this.survivalTime > 240 && rand < 0.2) {
        type = 'brute';
      } else if (this.survivalTime > 120 && rand < 0.35) {
        type = 'sniper';
      } else if (this.survivalTime > 60 && rand < 0.55) {
        type = 'weaver';
      } else if (rand < 0.7) {
        type = 'swarmer';
      }

      this.createEnemy(type, x, y);
    }
  }

  private createEnemy(type: Enemy['type'], x: number, y: number): Enemy {
    const timeScale = 1 + this.survivalTime / 180;
    const hpMult = this.dailyConfig ? this.dailyConfig.mutator.enemyHpMult : 1;
    const spdMult = this.dailyConfig ? this.dailyConfig.mutator.enemySpeedMult : 1;
    let radius = 14;
    let hp = 30 * timeScale;
    let speed = 3.2;
    let damage = 12;
    let color = '#06b6d4';
    let xpValue = 10;

    switch (type) {
      case 'drone':
        radius = 12;
        hp = 25 * timeScale;
        speed = 3.8;
        damage = 10;
        color = '#22d3ee';
        xpValue = 10;
        break;
      case 'swarmer':
        radius = 10;
        hp = 18 * timeScale;
        speed = 4.4;
        damage = 8;
        color = '#38bdf8';
        xpValue = 8;
        break;
      case 'weaver':
        radius = 15;
        hp = 55 * timeScale;
        speed = 3.5;
        damage = 16;
        color = '#f59e0b';
        xpValue = 22;
        break;
      case 'brute':
        radius = 24;
        hp = 180 * timeScale;
        speed = 2.4;
        damage = 32;
        color = '#ef4444';
        xpValue = 65;
        break;
      case 'sniper':
        radius = 16;
        hp = 70 * timeScale;
        speed = 2.8;
        damage = 22;
        color = '#ec4899';
        xpValue = 35;
        break;
      case 'boss_goliath':
        radius = 50;
        hp = 2200;
        speed = 1.6;
        damage = 40;
        color = '#f43f5e';
        xpValue = 400;
        break;
      case 'boss_nexus':
        radius = 58;
        hp = 4200;
        speed = 1.8;
        damage = 50;
        color = '#a855f7';
        xpValue = 800;
        break;
    }

    hp = Math.round(hp * hpMult);
    speed = speed * spdMult;

    const enemy: Enemy = {
      id: this.nextEntityId++,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      hp,
      maxHp: hp,
      speed,
      damage,
      color,
      xpValue,
      angle: 0,
      attackTimer: 0,
      specialTimer: 0,
      isBoss: type.startsWith('boss'),
    };

    this.enemies.push(enemy);
    return enemy;
  }

  private spawnBoss(type: 'boss_goliath' | 'boss_nexus') {
    soundEngine.playBossWarning();
    soundEngine.setBossMusic(true);
    this.addScreenShake(15);

    const angle = this.waveRng() * Math.PI * 2;
    const x = this.player.x + Math.cos(angle) * 600;
    const y = this.player.y + Math.sin(angle) * 600;

    const boss = this.createEnemy(type, x, y);
    this.currentBoss = boss;

    this.addFloatingText(
      this.player.x,
      this.player.y - 100,
      '⚠️ WARNING: HOSTILE DREADNOUGHT DETECTED ⚠️',
      '#ef4444',
      24,
      true
    );
  }

  private killEnemy(e: Enemy) {
    this.kills++;
    const scoreMult = this.dailyConfig ? this.dailyConfig.mutator.scoreMult : 1;
    this.score += Math.round(e.xpValue * 1.5 * scoreMult);

    if (e.isBoss) {
      this.bossesDefeated++;
      this.currentBoss = null;
      this.callbacks.onBossState(null);
      soundEngine.setBossMusic(false);
      soundEngine.playExplosion(2.2);
      this.addScreenShake(20);

      // Huge drop explosion
      this.spawnDrop(e.x, e.y, 'nuke', 1);
      this.spawnDrop(e.x + 30, e.y, 'health', 50);
      for (let k = 0; k < 8; k++) {
        this.spawnDrop(e.x + (this.combatRng() - 0.5) * 80, e.y + (this.combatRng() - 0.5) * 80, 'xp_large', 100);
      }
    } else {
      soundEngine.playSmallExplosion();

      // Normal Drops
      const rand = this.combatRng();
      if (rand < 0.04) {
        this.spawnDrop(e.x, e.y, 'health', 30);
      } else if (rand < 0.06) {
        this.spawnDrop(e.x, e.y, 'nuke', 1);
      } else {
        const xpType = e.xpValue >= 50 ? 'xp_large' : e.xpValue >= 20 ? 'xp_medium' : 'xp_small';
        this.spawnDrop(e.x, e.y, xpType, e.xpValue);
      }
    }

    // Singularity Core Upgrade check (scales up to LVL 5: every 5 kills at LVL 5)
    const singularityLvl = this.player.stats.upgrades['singularity_core'] || 0;
    if (singularityLvl > 0) {
      this.killsSinceSingularity++;
      const threshold = Math.max(5, 13 - singularityLvl * 2);
      if (this.killsSinceSingularity >= threshold) {
        this.killsSinceSingularity = 0;
        this.singularities.push({
          x: e.x,
          y: e.y,
          radius: 115 + singularityLvl * 30,
          life: 3.0 + singularityLvl * 0.3,
        });
        this.addShockwave(e.x, e.y, 80, '#c084fc');
      }
    }

    // Death explosion particles
    const particleCount = e.isBoss ? 50 : 10;
    for (let p = 0; p < particleCount; p++) {
      const pAngle = Math.random() * Math.PI * 2;
      const pSpeed = 1 + Math.random() * (e.isBoss ? 9 : 5);
      this.particles.push({
        x: e.x,
        y: e.y,
        vx: Math.cos(pAngle) * pSpeed,
        vy: Math.sin(pAngle) * pSpeed,
        color: e.color,
        size: 3 + Math.random() * 3,
        alpha: 1,
        decay: 0.04 + Math.random() * 0.04,
        glow: true,
      });
    }
  }

  private spawnDrop(x: number, y: number, type: DropItem['type'], value: number) {
    let color = '#22d3ee';
    let radius = 6;

    switch (type) {
      case 'xp_small':
        color = '#38bdf8';
        radius = 5.5;
        break;
      case 'xp_medium':
        color = '#a855f7';
        radius = 7;
        break;
      case 'xp_large':
        color = '#f59e0b';
        radius = 9;
        break;
      case 'health':
        color = '#10b981';
        radius = 9;
        break;
      case 'nuke':
        color = '#ec4899';
        radius = 10;
        break;
    }

    this.drops.push({
      id: this.nextEntityId++,
      x,
      y,
      type,
      value,
      radius,
      color,
      pulseTimer: Math.random() * Math.PI,
    });
  }

  private updateDrops(dt: number) {
    const p = this.player;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.pulseTimer += dt * 4;

      const dist = Math.hypot(p.x - drop.x, p.y - drop.y);

      // Magnetic attraction to player
      if (dist <= p.stats.pickupRadius) {
        const pullSpeed = (1 - dist / p.stats.pickupRadius) * 14 + 5;
        const angle = Math.atan2(p.y - drop.y, p.x - drop.x);
        drop.x += Math.cos(angle) * pullSpeed;
        drop.y += Math.sin(angle) * pullSpeed;
      }

      // Collect drop
      if (dist <= p.radius + drop.radius) {
        if (this.gameMode === 'online') {
          if (!this.pendingDropClaims.has(drop.id)) {
            this.pendingDropClaims.add(drop.id);
            realtimeClient.send({ type: 'drop:collect', dropId: drop.id }, false);
            this.drops.splice(i, 1);
          }
        } else {
          this.collectDrop(drop);
          this.drops.splice(i, 1);
        }
      }
    }
  }

  private collectDrop(drop: DropItem) {
    const p = this.player;

    if (drop.type === 'health') {
      p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + drop.value);
      this.addFloatingText(p.x, p.y, `+${drop.value} HP`, '#10b981', 18);
      soundEngine.playShieldHit();
    } else if (drop.type === 'nuke') {
      this.triggerEmpNova(4);
      this.addFloatingText(p.x, p.y, 'OVERDRIVE EMP!', '#ec4899', 22, true);
    } else {
      // XP (LVL 5 Graviton Harvester grants +25% bonus XP & score)
      const magnetLvl = p.stats.upgrades['quantum_magnet'] || 0;
      const xpMult = this.dailyConfig ? this.dailyConfig.mutator.xpMult : 1;
      const scoreMult = this.dailyConfig ? this.dailyConfig.mutator.scoreMult : 1;
      const xpGain = Math.round(drop.value * (magnetLvl >= 5 ? 1.25 : 1) * xpMult);
      p.stats.xp += xpGain;
      this.score += Math.round(xpGain * scoreMult);
      soundEngine.playXpPickup(p.stats.level);

      // Check level up
      if (p.stats.xp >= p.stats.xpToNextLevel) {
        this.triggerLevelUp();
      }
    }
  }

  private triggerLevelUp() {
    const p = this.player;
    p.stats.level++;
    p.stats.xp -= p.stats.xpToNextLevel;
    p.stats.xpToNextLevel = Math.round(p.stats.xpToNextLevel * 1.35);

    soundEngine.playLevelUp();
    this.addFloatingText(p.x, p.y, `LEVEL ${p.stats.level}!`, '#f59e0b', 26, true);
    this.addShockwave(p.x, p.y, 140, '#f59e0b');

    // Pause game and prompt upgrade modal
    this.pause();
    const available = this.getRandomUpgradeOptions();
    this.callbacks.onLevelUp(p.stats.level, available);
  }

  private damagePlayer(amount: number) {
    const p = this.player;
    if (p.invulnerableTimer > 0 || p.isDashing) return;

    p.invulnerableTimer = 350; // i-frames
    p.shieldRechargeTimer = 0; // reset recharge
    this.addScreenShake(6);

    // LVL 5 Nano-Reinforced Hull armor: 20% incoming damage reduction
    const hullLvl = p.stats.upgrades['hull_plating'] || 0;
    let remainingDmg = hullLvl >= 5 ? Math.round(amount * 0.8) : amount;
    if (p.stats.shield > 0) {
      soundEngine.playShieldHit();
      if (p.stats.shield >= remainingDmg) {
        p.stats.shield -= remainingDmg;
        remainingDmg = 0;
        this.addFloatingText(p.x, p.y, `-${Math.round(amount)}`, '#06b6d4', 16);
      } else {
        remainingDmg -= p.stats.shield;
        p.stats.shield = 0;
        this.addFloatingText(p.x, p.y, 'SHIELD BROKEN', '#06b6d4', 16, true);
      }
    }

    if (remainingDmg > 0) {
      soundEngine.playPlayerHit();
      p.stats.health = Math.max(0, p.stats.health - remainingDmg);
      this.addFloatingText(p.x, p.y, `-${Math.round(remainingDmg)}`, '#ef4444', 18, true);

      if (p.stats.health <= 0) {
        this.handleGameOver();
      }
    }
  }

  private updateSingularities(dt: number) {
    for (let i = this.singularities.length - 1; i >= 0; i--) {
      const s = this.singularities[i];
      s.life -= dt;

      if (s.life <= 0) {
        this.singularities.splice(i, 1);
        continue;
      }

      // Gravitational pull on all enemies
      for (const e of this.enemies) {
        const d = Math.hypot(s.x - e.x, s.y - e.y);
        if (d <= s.radius) {
          const pullAngle = Math.atan2(s.y - e.y, s.x - e.x);
          e.x += Math.cos(pullAngle) * 4.5;
          e.y += Math.sin(pullAngle) * 4.5;
          const sDmg = 20 * dt;
          e.hp -= sDmg;
          this.damageDealt += sDmg;
          this.queueOnlineDamage(e.id, sDmg);
        }
      }

      // Visual swirl particles
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const dist = Math.random() * s.radius;
        this.particles.push({
          x: s.x + Math.cos(a) * dist,
          y: s.y + Math.sin(a) * dist,
          vx: -Math.cos(a) * 3,
          vy: -Math.sin(a) * 3,
          color: '#a855f7',
          size: 3,
          alpha: 0.8,
          decay: 0.08,
          glow: true,
        });
      }
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Shockwaves
    for (let i = this.shockwaveRings.length - 1; i >= 0; i--) {
      const ring = this.shockwaveRings[i];
      ring.radius += dt * 350;
      ring.alpha = 1 - ring.radius / ring.maxRadius;
      if (ring.radius >= ring.maxRadius || ring.alpha <= 0) {
        this.shockwaveRings.splice(i, 1);
      }
    }
  }

  private updateFloatingTexts(dt: number) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt * 60;
      ft.alpha -= dt * 1.5;

      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number) {
    // Camera smoothly interpolates towards player
    const targetCamX = this.player.x - (this.canvas.width / (window.devicePixelRatio || 1)) / 2;
    const targetCamY = this.player.y - (this.canvas.height / (window.devicePixelRatio || 1)) / 2;

    this.cameraX += (targetCamX - this.cameraX) * 0.1;
    this.cameraY += (targetCamY - this.cameraY) * 0.1;

    // Decay screen shake
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 25);
    }
  }

  public addScreenShake(amount: number) {
    if (!this.screenShakeEnabled) return;
    this.shakeAmount = Math.min(25, this.shakeAmount + amount);
  }

  public addShockwave(x: number, y: number, maxRadius: number, color: string) {
    this.shockwaveRings.push({
      x,
      y,
      radius: 5,
      maxRadius,
      color,
      alpha: 1,
    });
  }

  public addFloatingText(x: number, y: number, text: string, color: string, size = 14, isCrit = false) {
    if (!this.showDamageNumbers && !isCrit) return;
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 15,
      y: y - 10,
      vy: -1.2,
      text,
      color,
      alpha: 1,
      size,
      isCrit,
    });
  }

  private handleGameOver() {
    this.stop();
    const summary = this.createSummary(false);
    this.callbacks.onGameOver(summary);
  }

  private handleVictory() {
    this.stop();
    const summary = this.createSummary(true);
    this.callbacks.onVictory(summary);
  }

  private createSummary(isVictory: boolean): RunSummary {
    const upgradesList = Object.entries(this.player.stats.upgrades).map(([id, level]) => {
      const def = UPGRADE_CATALOG.find((u) => u.id === id);
      return {
        id,
        title: def ? def.title : id,
        level,
        rarity: def ? def.rarity : 'common',
      };
    });

    return {
      survivalTime: Math.floor(this.survivalTime),
      score: this.score + (isVictory ? 5000 : 0),
      kills: this.kills,
      level: this.player.stats.level,
      damageDealt: Math.round(this.damageDealt),
      bossesDefeated: this.bossesDefeated,
      shipId: this.selectedShip.id,
      shipName: this.selectedShip.name,
      gameMode: this.gameMode,
      upgrades: upgradesList,
      isNewHighScore: false,
      dailyDateKey: this.dailyConfig?.dateKey,
      dailyChallengeCode: this.dailyConfig?.challengeCode,
      dailyMutatorName: this.dailyConfig?.mutator.name,
    };
  }

  // ================= RENDER PIPELINE =================
  private render() {
    const ctx = this.ctx;
    const viewW = this.canvas.width / (window.devicePixelRatio || 1);
    const viewH = this.canvas.height / (window.devicePixelRatio || 1);

    // Apply Screen Shake
    let offsetX = 0;
    let offsetY = 0;
    if (this.shakeAmount > 0) {
      offsetX = (Math.random() - 0.5) * this.shakeAmount;
      offsetY = (Math.random() - 0.5) * this.shakeAmount;
    }

    // Clear Canvas
    ctx.fillStyle = '#06080e';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.save();
    ctx.translate(-this.cameraX + offsetX, -this.cameraY + offsetY);

    // Render Grid & Arena Boundary
    this.renderArenaGrid(ctx);

    // Render Hiding Spots (Phase-Cloak Zones)
    this.renderHidingSpots(ctx);

    // Render Singularities
    this.renderSingularities(ctx);

    // Render Drops
    this.renderDrops(ctx);

    // Render Enemies
    this.renderEnemies(ctx);

    // Render Orbiting Orbs
    this.renderOrbitingOrbs(ctx);

    // Render Online Squadmates
    if (this.gameMode === 'online' && this.remotePlayers.length > 0) {
      this.renderRemotePlayers(ctx);
    }

    // Render Player
    this.renderPlayer(ctx);

    // Render Bullets
    this.renderBullets(ctx);

    // Render Shockwaves & Particles
    this.renderShockwaves(ctx);
    this.renderParticles(ctx);

    // Render Floating Text
    this.renderFloatingTexts(ctx);

    ctx.restore();

    // Render Screen-space Tactical Minimap (shows hiding spots & threats)
    this.renderMinimap(ctx, viewW, viewH);
  }

  private renderArenaGrid(ctx: CanvasRenderingContext2D) {
    // Cyberpunk grid
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;

    const gridSize = 80;
    const startX = Math.max(0, Math.floor(this.cameraX / gridSize) * gridSize);
    const endX = Math.min(this.arenaWidth, startX + this.canvas.width + gridSize);
    const startY = Math.max(0, Math.floor(this.cameraY / gridSize) * gridSize);
    const endY = Math.min(this.arenaHeight, startY + this.canvas.height + gridSize);

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();

    // Arena Perimeter Glow
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, this.arenaWidth - 40, this.arenaHeight - 40);

    ctx.strokeStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, this.arenaWidth - 40, this.arenaHeight - 40);
  }

  private renderHidingSpots(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    for (const spot of this.hidingSpots) {
      const dist = Math.hypot(p.x - spot.x, p.y - spot.y);
      const isPlayerInside = dist <= spot.radius - 6;
      const isCompromised = spot.compromisedTimer > 0 || (isPlayerInside && this.stealthRevealTimer > 0);
      const pulse = Math.sin(spot.pulsePhase) * 3;

      ctx.save();
      ctx.translate(spot.x, spot.y);

      const baseColor = isCompromised ? '#f59e0b' : '#10b981';

      // Soft stealth nebula fill
      const grad = ctx.createRadialGradient(0, 0, 8, 0, 0, spot.radius);
      grad.addColorStop(0, isCompromised ? 'rgba(245, 158, 11, 0.22)' : isPlayerInside ? 'rgba(16, 185, 129, 0.28)' : 'rgba(16, 185, 129, 0.14)');
      grad.addColorStop(0.75, isCompromised ? 'rgba(245, 158, 11, 0.09)' : 'rgba(16, 185, 129, 0.08)');
      grad.addColorStop(1, 'rgba(6, 8, 14, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, spot.radius, 0, Math.PI * 2);
      ctx.fill();

      // Octagonal holographic bunker outline
      ctx.strokeStyle = baseColor;
      ctx.globalAlpha = isPlayerInside ? 0.9 : 0.48;
      ctx.lineWidth = isPlayerInside ? 2.5 : 1.75;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -spot.pulsePhase * 6;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = spot.radius + pulse * 0.6;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // Inner stealth reticle
      ctx.setLineDash([]);
      ctx.globalAlpha = isPlayerInside ? 0.45 : 0.22;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, spot.radius * 0.45, 0, Math.PI * 2);
      ctx.stroke();

      // Label when near or inside
      if (dist < 420) {
        ctx.globalAlpha = isPlayerInside ? 0.95 : 0.65;
        ctx.fillStyle = baseColor;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          isCompromised ? 'COMPROMISED' : isPlayerInside ? 'CLOAK ACTIVE' : 'HIDING SPOT',
          0,
          -spot.radius + 14
        );
      }

      ctx.restore();
    }
  }

  private renderSingularities(ctx: CanvasRenderingContext2D) {
    for (const s of this.singularities) {
      ctx.save();
      const grad = ctx.createRadialGradient(s.x, s.y, 5, s.x, s.y, s.radius);
      grad.addColorStop(0, '#000000');
      grad.addColorStop(0.3, '#7c3aed');
      grad.addColorStop(1, 'transparent');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = '#c084fc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderDrops(ctx: CanvasRenderingContext2D) {
    for (const d of this.drops) {
      ctx.save();
      const pulse = Math.sin(d.pulseTimer) * 1.5;
      const r = d.radius + pulse;

      // Glow halo
      ctx.fillStyle = d.color;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(d.x, d.y, r + 4, 0, Math.PI * 2);
      ctx.fill();

      // Core diamond or circle
      ctx.globalAlpha = 1;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      if (d.type.startsWith('xp')) {
        // Diamond
        ctx.moveTo(d.x, d.y - r);
        ctx.lineTo(d.x + r, d.y);
        ctx.lineTo(d.x, d.y + r);
        ctx.lineTo(d.x - r, d.y);
        ctx.closePath();
      } else {
        // Orb
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      }
      ctx.fill();

      ctx.restore();
    }
  }

  private renderEnemies(ctx: CanvasRenderingContext2D) {
    for (const e of this.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);

      // Boss or regular shape
      if (e.isBoss) {
        // Octagonal Boss Dreadnought
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;

        ctx.beginPath();
        const sides = e.type === 'boss_nexus' ? 12 : 8;
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          const px = Math.cos(a) * e.radius;
          const py = Math.sin(a) * e.radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing core
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Standard Enemies
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        if (e.type === 'drone' || e.type === 'swarmer') {
          // Sharp fighter triangle
          ctx.moveTo(e.radius, 0);
          ctx.lineTo(-e.radius * 0.8, -e.radius * 0.8);
          ctx.lineTo(-e.radius * 0.4, 0);
          ctx.lineTo(-e.radius * 0.8, e.radius * 0.8);
        } else if (e.type === 'weaver') {
          // Sleek dart
          ctx.moveTo(e.radius, 0);
          ctx.lineTo(-e.radius, -e.radius * 0.6);
          ctx.lineTo(-e.radius * 0.3, 0);
          ctx.lineTo(-e.radius, e.radius * 0.6);
        } else if (e.type === 'brute') {
          // Heavy Hexagon
          for (let s = 0; s < 6; s++) {
            const a = (s / 6) * Math.PI * 2;
            const px = Math.cos(a) * e.radius;
            const py = Math.sin(a) * e.radius;
            if (s === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
        } else if (e.type === 'sniper') {
          // Sniper turret with barrel
          ctx.arc(0, 0, e.radius * 0.8, 0, Math.PI * 2);
          ctx.moveTo(0, 0);
          ctx.lineTo(e.radius * 1.5, 0);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();

      // Sniper aim line telegraph
      if (e.type === 'sniper' && e.attackTimer >= 1.6) {
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(e.angle) * 350, e.y + Math.sin(e.angle) * 350);
        ctx.stroke();
        ctx.restore();
      }

      // Small HP bar for larger enemies (brute/boss)
      if (e.hp < e.maxHp && !e.isBoss) {
        const barW = e.radius * 2;
        const barH = 4;
        const barX = e.x - barW / 2;
        const barY = e.y - e.radius - 8;

        ctx.fillStyle = '#334155';
        ctx.fillRect(barX, barY, barW, barH);

        const hpRatio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = e.color;
        ctx.fillRect(barX, barY, barW * hpRatio, barH);
      }

      // Searching "?" indicator when player is hidden
      if (this.isHidden && !e.isBoss) {
        ctx.save();
        ctx.fillStyle = '#34d399';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?', e.x, e.y - e.radius - 12);
        ctx.restore();
      }
    }
  }

  private renderOrbitingOrbs(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    for (const orb of this.orbitingOrbs) {
      const ox = p.x + Math.cos(orb.angle) * orb.distance;
      const oy = p.y + Math.sin(orb.angle) * orb.distance;

      ctx.save();
      // Glowing plasma halo
      ctx.fillStyle = orb.color;
      ctx.globalAlpha = this.isHidden ? 0.15 : 0.35;
      ctx.beginPath();
      ctx.arc(ox, oy, orb.radius * 2, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.globalAlpha = this.isHidden ? 0.35 : 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox, oy, orb.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Invulnerability blink or Stealth Cloak translucency
    if (p.invulnerableTimer > 0 && Math.floor(p.invulnerableTimer / 50) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    } else if (this.isHidden) {
      ctx.globalAlpha = 0.35;
    }

    // Stealth cloak aura ring
    if (this.isHidden) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Shield Dome if shield is up
    if (p.stats.shield > 0) {
      const shieldRatio = p.stats.shield / p.stats.maxShield;
      ctx.strokeStyle = this.isHidden
        ? `rgba(16, 185, 129, ${0.3 + shieldRatio * 0.4})`
        : `rgba(6, 182, 212, ${0.3 + shieldRatio * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Rotate player ship towards angle
    ctx.rotate(p.angle);

    // Ship Body
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = this.isHidden ? '#10b981' : this.selectedShip.color;
    ctx.lineWidth = 3;

    ctx.beginPath();
    // Arrow-wing delta fighter
    ctx.moveTo(p.radius * 1.3, 0); // nose
    ctx.lineTo(-p.radius, -p.radius * 0.9); // left wingtip
    ctx.lineTo(-p.radius * 0.5, 0); // rear engine
    ctx.lineTo(-p.radius, p.radius * 0.9); // right wingtip
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit canopy
    ctx.fillStyle = this.isHidden ? '#34d399' : this.selectedShip.accentColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, p.radius * 0.45, p.radius * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderRemotePlayers(ctx: CanvasRenderingContext2D) {
    for (const rp of this.remotePlayers) {
      ctx.save();
      ctx.translate(rp.x, rp.y);

      if (rp.isHidden) {
        ctx.globalAlpha = 0.4;
        ctx.save();
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (rp.shield > 0 && rp.maxShield > 0) {
        const shieldRatio = rp.shield / rp.maxShield;
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.25 + shieldRatio * 0.4})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ship body
      ctx.save();
      ctx.rotate(rp.angle);
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = rp.isHidden ? '#10b981' : rp.color || '#38bdf8';
      ctx.lineWidth = 2.5;

      const r = 17;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.lineTo(-r, -r * 0.9);
      ctx.lineTo(-r * 0.5, 0);
      ctx.lineTo(-r, r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = rp.isHidden ? '#34d399' : rp.accentColor || '#f472b6';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.45, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Callsign & HP bar above remote pilot
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${rp.pilotName} · L${rp.level}`, 0, -28);

      const barW = 36;
      const barH = 3.5;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-barW / 2, -23, barW, barH);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(-barW / 2, -23, barW * Math.max(0, Math.min(1, rp.hp / Math.max(1, rp.maxHp))), barH);

      ctx.restore();
    }
  }

  private renderBullets(ctx: CanvasRenderingContext2D) {
    const allBullets = this.remoteBullets.length > 0 ? [...this.bullets, ...this.remoteBullets] : this.bullets;
    for (const b of allBullets) {
      ctx.save();
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.isCrit ? 10 : 6;

      ctx.beginPath();
      if (b.isHoming) {
        // Rocket shape
        const angle = Math.atan2(b.vy, b.vx);
        ctx.translate(b.x, b.y);
        ctx.rotate(angle);
        ctx.fillRect(-8, -3, 16, 6);
      } else {
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderShockwaves(ctx: CanvasRenderingContext2D) {
    for (const ring of this.shockwaveRings) {
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = Math.max(0, ring.alpha);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderFloatingTexts(ctx: CanvasRenderingContext2D) {
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.font = `${ft.isCrit ? 'bold ' : ''}${ft.size}px monospace`;
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private renderMinimap(ctx: CanvasRenderingContext2D, viewW: number, viewH: number) {
    if (viewW < 640 || viewH < 480) return;

    const size = 112;
    const padX = 16;
    const padY = viewH - 134 - size;
    const scaleX = size / this.arenaWidth;
    const scaleY = size / this.arenaHeight;

    ctx.save();
    ctx.translate(padX, padY);

    // Radar background
    ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 12);
    ctx.fill();
    ctx.stroke();

    // Hiding Spots (emerald zones)
    for (const spot of this.hidingSpots) {
      const sx = spot.x * scaleX;
      const sy = spot.y * scaleY;
      ctx.fillStyle = spot.compromisedTimer > 0 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(16, 185, 129, 0.75)';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies
    for (const e of this.enemies) {
      const ex = e.x * scaleX;
      const ey = e.y * scaleY;
      ctx.fillStyle = e.isBoss ? '#f43f5e' : 'rgba(248, 113, 113, 0.7)';
      ctx.beginPath();
      ctx.arc(ex, ey, e.isBoss ? 4.2 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Remote Squadmates
    if (this.gameMode === 'online') {
      for (const rp of this.remotePlayers) {
        ctx.fillStyle = rp.isHidden ? '#10b981' : '#f472b6';
        ctx.beginPath();
        ctx.arc(rp.x * scaleX, rp.y * scaleY, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Player
    const px = this.player.x * scaleX;
    const py = this.player.y * scaleY;
    ctx.fillStyle = this.isHidden ? '#34d399' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('RADAR • COVER', 6, 11);

    ctx.restore();
  }
}
