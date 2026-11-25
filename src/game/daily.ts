import { DailyChallengeConfig, DailyMutator } from '../types';
import { SHIP_CLASSES, UPGRADE_CATALOG } from './constants';

export const DAILY_MUTATORS: DailyMutator[] = [
  {
    id: 'swarm_surge',
    name: 'Swarm Surge',
    description: 'Hostile drone factories operate at peak output across the sector.',
    effectsSummary: '+30% Enemy Density · +20% Score Bonus',
    spawnRateMult: 0.77,
    scoreMult: 1.2,
    damageMult: 1.0,
    hullMult: 1.0,
    playerSpeedMult: 1.0,
    enemySpeedMult: 1.0,
    enemyHpMult: 1.0,
    fireRateMult: 1.0,
    dashCooldownMult: 1.0,
    hidingSpotCount: 9,
    ambushBonus: 0,
    bossInterval: 150,
    xpMult: 1.0,
  },
  {
    id: 'glass_cannon',
    name: 'Glass Cannon',
    description: 'Weapons overcharged to lethal thresholds at the cost of hull plating.',
    effectsSummary: '+35% Weapon Damage · -20% Max Hull · +25% Score',
    spawnRateMult: 1.0,
    scoreMult: 1.25,
    damageMult: 1.35,
    hullMult: 0.8,
    playerSpeedMult: 1.05,
    enemySpeedMult: 1.0,
    enemyHpMult: 1.0,
    fireRateMult: 1.0,
    dashCooldownMult: 1.0,
    hidingSpotCount: 9,
    ambushBonus: 0,
    bossInterval: 150,
    xpMult: 1.0,
  },
  {
    id: 'hyper_velocity',
    name: 'Hyper-Velocity',
    description: 'Sub-light thrusters and hostile interceptors run in accelerated overdrive.',
    effectsSummary: '+20% Flight & Shot Speed · +15% Enemy Speed · +20% Score',
    spawnRateMult: 0.95,
    scoreMult: 1.2,
    damageMult: 1.0,
    hullMult: 1.0,
    playerSpeedMult: 1.2,
    enemySpeedMult: 1.15,
    enemyHpMult: 1.0,
    fireRateMult: 1.05,
    dashCooldownMult: 0.9,
    hidingSpotCount: 9,
    ambushBonus: 0,
    bossInterval: 150,
    xpMult: 1.0,
  },
  {
    id: 'shadow_protocol',
    name: 'Shadow Protocol',
    description: 'Dense phase-cloak anomalies reward stealth repositioning and ambush strikes.',
    effectsSummary: '12 Hiding Spots · +50% Ambush Crit Dmg · +20% Score',
    spawnRateMult: 0.9,
    scoreMult: 1.2,
    damageMult: 1.0,
    hullMult: 1.0,
    playerSpeedMult: 1.0,
    enemySpeedMult: 1.05,
    enemyHpMult: 1.0,
    fireRateMult: 1.0,
    dashCooldownMult: 1.0,
    hidingSpotCount: 12,
    ambushBonus: 0.5,
    bossInterval: 150,
    xpMult: 1.0,
  },
  {
    id: 'overclocked_reactor',
    name: 'Overclocked Reactor',
    description: 'Auxiliary capacitors double weapon cadence while armored hostiles surge.',
    effectsSummary: '+25% Fire Rate · -20% Dash CD · +25% Enemy HP · +20% Score',
    spawnRateMult: 1.0,
    scoreMult: 1.2,
    damageMult: 1.0,
    hullMult: 1.0,
    playerSpeedMult: 1.0,
    enemySpeedMult: 1.0,
    enemyHpMult: 1.25,
    fireRateMult: 1.25,
    dashCooldownMult: 0.8,
    hidingSpotCount: 9,
    ambushBonus: 0,
    bossInterval: 150,
    xpMult: 1.1,
  },
  {
    id: 'dreadnought_gauntlet',
    name: 'Dreadnought Gauntlet',
    description: 'Capital ships warp in frequently across an XP-rich combat zone.',
    effectsSummary: 'Bosses Every 2:00 · +25% XP Cores · +25% Score',
    spawnRateMult: 0.95,
    scoreMult: 1.25,
    damageMult: 1.1,
    hullMult: 1.1,
    playerSpeedMult: 1.0,
    enemySpeedMult: 1.0,
    enemyHpMult: 1.0,
    fireRateMult: 1.0,
    dashCooldownMult: 1.0,
    hidingSpotCount: 10,
    ambushBonus: 0,
    bossInterval: 120,
    xpMult: 1.25,
  },
];

const DAILY_STARTING_MODULES = [
  'pulse_split',
  'orbit_nanites',
  'arc_lightning',
  'homing_missiles',
  'emp_nova',
  'stealth_cloak',
  'crit_matrix',
];

export function hashStringToUint32(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRng(seedInput: number | string): () => number {
  let state = typeof seedInput === 'string' ? hashStringToUint32(seedInput) : (seedInput >>> 0);
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getUtcDateKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNextUtcResetTimestamp(date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0);
}

export function formatResetCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getDailyChallengeConfig(date = new Date()): DailyChallengeConfig {
  const dateKey = getUtcDateKey(date);
  const challengeCode = `NR-${dateKey.replace(/-/g, '')}`;
  const seed = hashStringToUint32(`NEON-ROGUE-DAILY-${dateKey}`);
  const rng = createSeededRng(seed);

  const shipIdx = Math.floor(rng() * SHIP_CLASSES.length);
  const mutatorIdx = Math.floor(rng() * DAILY_MUTATORS.length);
  const moduleIdx = Math.floor(rng() * DAILY_STARTING_MODULES.length);

  const ship = SHIP_CLASSES[shipIdx];
  const mutator = DAILY_MUTATORS[mutatorIdx];
  const startingUpgradeId = DAILY_STARTING_MODULES[moduleIdx];
  const moduleDef = UPGRADE_CATALOG.find((u) => u.id === startingUpgradeId);

  return {
    dateKey,
    challengeCode,
    seed,
    ship,
    mutator,
    startingUpgradeId,
    startingUpgradeTitle: moduleDef ? moduleDef.title : startingUpgradeId,
    resetTimestamp: getNextUtcResetTimestamp(date),
  };
}
