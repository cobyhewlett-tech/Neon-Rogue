export type GameStatus = 'menu' | 'playing' | 'levelup' | 'paused' | 'gameover' | 'victory';

export type GameMode = 'survivor' | 'endless' | 'daily';

export interface DailyMutator {
  id: string;
  name: string;
  description: string;
  effectsSummary: string;
  spawnRateMult: number;
  scoreMult: number;
  damageMult: number;
  hullMult: number;
  playerSpeedMult: number;
  enemySpeedMult: number;
  enemyHpMult: number;
  fireRateMult: number;
  dashCooldownMult: number;
  hidingSpotCount: number;
  ambushBonus: number;
  bossInterval: number;
  xpMult: number;
}

export interface DailyChallengeConfig {
  dateKey: string;
  challengeCode: string;
  seed: number;
  ship: ShipClass;
  mutator: DailyMutator;
  startingUpgradeId: string;
  startingUpgradeTitle: string;
  resetTimestamp: number;
}

export interface DailyLeaderboardEntry {
  id: string;
  uid: string;
  dateKey: string;
  challengeCode: string;
  pilotName: string;
  shipId: string;
  shipName: string;
  mutatorName: string;
  score: number;
  kills: number;
  survivalTime: number;
  level: number;
  bossesDefeated: number;
}

export interface ShipClass {
  id: string;
  name: string;
  codename: string;
  description: string;
  color: string;
  accentColor: string;
  baseMaxHealth: number;
  baseShield: number;
  shieldRechargeRate: number; // per second
  shieldRechargeDelay: number; // ms
  baseSpeed: number;
  dashCooldown: number; // ms
  dashDuration: number; // ms
  dashSpeedMult: number;
  baseFireRate: number; // shots per sec
  baseDamage: number;
  baseBulletSpeed: number;
  specialTrait: string;
  unlockedByDefault: boolean;
  unlockRequirement?: string;
}

export type UpgradeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type UpgradeCategory = 'weapon' | 'defense' | 'utility' | 'special';

export interface UpgradeDefinition {
  id: string;
  title: string;
  description: string;
  category: UpgradeCategory;
  rarity: UpgradeRarity;
  iconName: string;
  maxLevel: number;
  currentLevel: number;
  statBonusText: string;
  lvl5BonusText?: string;
}

export interface PlayerStats {
  level: number;
  xp: number;
  xpToNextLevel: number;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  speed: number;
  fireRate: number;
  damage: number;
  bulletSpeed: number;
  bulletCount: number;
  critChance: number;
  critMultiplier: number;
  pickupRadius: number;
  regenRate: number;
  dashCooldown: number;
  dashTimer: number;
  isDashing: boolean;
  inHidingSpot: boolean;
  isHidden: boolean;
  stealthRevealTimer: number;
  // Upgrade levels tracked
  upgrades: Record<string, number>;
}

export interface RunSummary {
  survivalTime: number; // in seconds
  score: number;
  kills: number;
  level: number;
  damageDealt: number;
  bossesDefeated: number;
  shipId: string;
  shipName: string;
  gameMode: GameMode;
  upgrades: { id: string; title: string; level: number; rarity: UpgradeRarity }[];
  isNewHighScore: boolean;
  dailyDateKey?: string;
  dailyChallengeCode?: string;
  dailyMutatorName?: string;
  isNewDailyBest?: boolean;
}

export interface HighScoreEntry {
  id: string;
  score: number;
  survivalTime: number;
  kills: number;
  level: number;
  shipName: string;
  date: string;
}

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  muted: boolean;
}

export interface GameSettings {
  screenShake: boolean;
  autoFire: boolean;
  showDamageNumbers: boolean;
  audio: AudioSettings;
}
