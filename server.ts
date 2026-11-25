import express from 'express';
import fs from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const ARENA_WIDTH = 2400;
const ARENA_HEIGHT = 2400;

interface ServerHidingSpot {
  id: number;
  x: number;
  y: number;
  radius: number;
  pulsePhase: number;
  compromisedTimer: number;
}

interface ServerEnemy {
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
  attackTimer: number;
  specialTimer: number;
  isCharging: boolean;
  isBoss: boolean;
  patrolAngle: number;
  patrolTimer: number;
  lastDamagedBy?: string;
}

interface ServerDrop {
  id: number;
  x: number;
  y: number;
  type: 'xp_small' | 'xp_medium' | 'xp_large' | 'health' | 'nuke';
  value: number;
  radius: number;
  color: string;
}

interface ConnectedPilot {
  id: string;
  ws: WebSocket;
  pilotName: string;
  shipId: string;
  shipName: string;
  color: string;
  accentColor: string;
  roomId: string;
  status: 'menu' | 'playing';
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  isHidden: boolean;
  isDashing: boolean;
  level: number;
  score: number;
  kills: number;
  lastKnownX: number;
  lastKnownY: number;
}

interface ServerChatMsg {
  id: string;
  senderId: string;
  pilotName: string;
  shipName: string;
  channel: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

interface SquadRoom {
  roomId: string;
  survivalTime: number;
  spawnTimer: number;
  nextBossTime: number;
  bossCount: number;
  nextEntityId: number;
  hidingSpots: ServerHidingSpot[];
  enemies: ServerEnemy[];
  drops: ServerDrop[];
  pilots: Map<string, ConnectedPilot>;
  chatHistory: ServerChatMsg[];
}

const clients = new Map<string, ConnectedPilot>();
const rooms = new Map<string, SquadRoom>();
const globalChatHistory: ServerChatMsg[] = [];
let nextClientSeq = 1;
let nextChatSeq = 1;

function sanitizeName(raw: unknown, fallback = 'Rogue Pilot'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 28);
  return cleaned || fallback;
}

function sanitizeRoomId(raw: unknown): string {
  if (typeof raw !== 'string') return 'PUBLIC';
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16);
  return cleaned || 'PUBLIC';
}

function sanitizeChatText(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\r\n]+/g, ' ').trim().slice(0, 240);
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastAll(payload: unknown) {
  const encoded = JSON.stringify(payload);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(encoded);
    }
  }
}

function broadcastRoom(room: SquadRoom, payload: unknown, excludeId?: string) {
  const encoded = JSON.stringify(payload);
  for (const pilot of room.pilots.values()) {
    if (excludeId && pilot.id === excludeId) continue;
    if (pilot.ws.readyState === WebSocket.OPEN) {
      pilot.ws.send(encoded);
    }
  }
}

function generateRoomHidingSpots(room: SquadRoom, count = 9, radius = 92) {
  room.hidingSpots = [];
  const center = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
  const nearAngles = [Math.random() * Math.PI * 2, 0];
  nearAngles[1] = nearAngles[0] + Math.PI * (0.8 + Math.random() * 0.4);

  for (let i = 0; i < Math.min(2, count); i++) {
    const dist = 250 + Math.random() * 140;
    room.hidingSpots.push({
      id: room.nextEntityId++,
      x: Math.round(center.x + Math.cos(nearAngles[i]) * dist),
      y: Math.round(center.y + Math.sin(nearAngles[i]) * dist),
      radius,
      pulsePhase: Math.random() * Math.PI * 2,
      compromisedTimer: 0,
    });
  }

  let attempts = 0;
  while (room.hidingSpots.length < count && attempts < 200) {
    attempts++;
    const margin = 220;
    const x = margin + Math.random() * (ARENA_WIDTH - margin * 2);
    const y = margin + Math.random() * (ARENA_HEIGHT - margin * 2);
    if (Math.hypot(x - center.x, y - center.y) < 180) continue;
    if (room.hidingSpots.some((s) => Math.hypot(s.x - x, s.y - y) < 360)) continue;
    room.hidingSpots.push({
      id: room.nextEntityId++,
      x: Math.round(x),
      y: Math.round(y),
      radius,
      pulsePhase: Math.random() * Math.PI * 2,
      compromisedTimer: 0,
    });
  }
}

function getOrCreateRoom(roomId: string): SquadRoom {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      survivalTime: 0,
      spawnTimer: 0,
      nextBossTime: 150,
      bossCount: 0,
      nextEntityId: 1,
      hidingSpots: [],
      enemies: [],
      drops: [],
      pilots: new Map(),
      chatHistory: [],
    };
    generateRoomHidingSpots(room, 9, 92);
    rooms.set(roomId, room);
  }
  return room;
}

function pushGlobalChat(msg: ServerChatMsg) {
  globalChatHistory.push(msg);
  if (globalChatHistory.length > 50) {
    globalChatHistory.shift();
  }
  broadcastAll({ type: 'chat:message', message: msg });
}

function pushSquadChat(room: SquadRoom, msg: ServerChatMsg) {
  room.chatHistory.push(msg);
  if (room.chatHistory.length > 50) {
    room.chatHistory.shift();
  }
  broadcastRoom(room, { type: 'chat:message', message: msg });
}

function broadcastPresence() {
  const pilots = Array.from(clients.values()).map((p) => ({
    id: p.id,
    pilotName: p.pilotName,
    shipName: p.shipName,
    roomId: p.roomId,
    status: p.status,
    score: p.score,
  }));

  const activeRooms = Array.from(rooms.values())
    .filter((r) => r.pilots.size > 0)
    .map((r) => ({
      roomId: r.roomId,
      playerCount: r.pilots.size,
      survivalTime: Math.floor(r.survivalTime),
    }));

  broadcastAll({
    type: 'presence:update',
    onlineCount: pilots.length,
    pilots,
    rooms: activeRooms,
  });
}

function createServerEnemy(
  room: SquadRoom,
  type: ServerEnemy['type'],
  x: number,
  y: number
): ServerEnemy {
  const timeScale = 1 + room.survivalTime / 180;
  const playerScale = 1 + Math.max(0, room.pilots.size - 1) * 0.35;
  let radius = 14;
  let hp = 30 * timeScale * playerScale;
  let speed = 3.2;
  let damage = 12;
  let color = '#06b6d4';
  let xpValue = 10;

  switch (type) {
    case 'drone':
      radius = 12;
      hp = 25 * timeScale * playerScale;
      speed = 3.8;
      damage = 10;
      color = '#22d3ee';
      xpValue = 10;
      break;
    case 'swarmer':
      radius = 10;
      hp = 18 * timeScale * playerScale;
      speed = 4.4;
      damage = 8;
      color = '#38bdf8';
      xpValue = 8;
      break;
    case 'weaver':
      radius = 15;
      hp = 55 * timeScale * playerScale;
      speed = 3.5;
      damage = 16;
      color = '#f59e0b';
      xpValue = 22;
      break;
    case 'brute':
      radius = 24;
      hp = 180 * timeScale * playerScale;
      speed = 2.4;
      damage = 32;
      color = '#ef4444';
      xpValue = 65;
      break;
    case 'sniper':
      radius = 16;
      hp = 70 * timeScale * playerScale;
      speed = 2.8;
      damage = 22;
      color = '#ec4899';
      xpValue = 35;
      break;
    case 'boss_goliath':
      radius = 50;
      hp = 2400 * playerScale;
      speed = 1.6;
      damage = 40;
      color = '#f43f5e';
      xpValue = 400;
      break;
    case 'boss_nexus':
      radius = 58;
      hp = 4400 * playerScale;
      speed = 1.8;
      damage = 50;
      color = '#a855f7';
      xpValue = 800;
      break;
  }

  const enemy: ServerEnemy = {
    id: room.nextEntityId++,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    hp: Math.round(hp),
    maxHp: Math.round(hp),
    speed,
    damage,
    color,
    xpValue,
    angle: 0,
    attackTimer: 0,
    specialTimer: 0,
    isCharging: false,
    isBoss: type.startsWith('boss'),
    patrolAngle: Math.random() * Math.PI * 2,
    patrolTimer: 1.5,
  };
  room.enemies.push(enemy);
  return enemy;
}

function spawnRoomDrop(
  room: SquadRoom,
  x: number,
  y: number,
  type: ServerDrop['type'],
  value: number
) {
  let color = '#22d3ee';
  let radius = 6;
  if (type === 'xp_small') {
    color = '#38bdf8';
    radius = 5.5;
  } else if (type === 'xp_medium') {
    color = '#a855f7';
    radius = 7;
  } else if (type === 'xp_large') {
    color = '#f59e0b';
    radius = 9;
  } else if (type === 'health') {
    color = '#10b981';
    radius = 9;
  } else if (type === 'nuke') {
    color = '#ec4899';
    radius = 10;
  }

  room.drops.push({
    id: room.nextEntityId++,
    x: Math.round(x),
    y: Math.round(y),
    type,
    value,
    radius,
    color,
  });
  if (room.drops.length > 180) {
    room.drops.shift();
  }
}

function killRoomEnemy(room: SquadRoom, e: ServerEnemy, killerId?: string) {
  if (e.isBoss) {
    spawnRoomDrop(room, e.x, e.y, 'nuke', 1);
    spawnRoomDrop(room, e.x + 30, e.y, 'health', 50);
    for (let k = 0; k < 8; k++) {
      spawnRoomDrop(
        room,
        e.x + (Math.random() - 0.5) * 80,
        e.y + (Math.random() - 0.5) * 80,
        'xp_large',
        100
      );
    }
  } else {
    const rand = Math.random();
    if (rand < 0.05) {
      spawnRoomDrop(room, e.x, e.y, 'health', 30);
    } else if (rand < 0.07) {
      spawnRoomDrop(room, e.x, e.y, 'nuke', 1);
    } else {
      const xpType = e.xpValue >= 50 ? 'xp_large' : e.xpValue >= 20 ? 'xp_medium' : 'xp_small';
      spawnRoomDrop(room, e.x, e.y, xpType, e.xpValue);
    }
  }

  broadcastRoom(room, {
    type: 'enemy:killed',
    enemyId: e.id,
    x: Math.round(e.x),
    y: Math.round(e.y),
    color: e.color,
    isBoss: e.isBoss,
    xpValue: e.xpValue,
    killerId: killerId || e.lastDamagedBy || '',
  });
}

function leaveCurrentRoom(pilot: ConnectedPilot) {
  if (pilot.roomId === 'LOBBY') return;
  const room = rooms.get(pilot.roomId);
  const oldRoomId = pilot.roomId;
  pilot.roomId = 'LOBBY';
  pilot.status = 'menu';

  if (room) {
    room.pilots.delete(pilot.id);
    pushSquadChat(room, {
      id: `sys_${Date.now()}_${nextChatSeq++}`,
      senderId: 'SYSTEM',
      pilotName: 'SQUAD COMMS',
      shipName: 'Control',
      channel: oldRoomId,
      text: `${pilot.pilotName} left Squad ${oldRoomId}.`,
      timestamp: Date.now(),
      isSystem: true,
    });
    if (room.pilots.size === 0) {
      rooms.delete(oldRoomId);
    }
  }
}

// 20Hz Authoritative Multiplayer Tick for active Online Co-op Squad Rooms
setInterval(() => {
  const dt = 0.05;
  const frameStep = dt * 60; // normalized to 60fps velocity units

  for (const room of rooms.values()) {
    if (room.pilots.size === 0) continue;

    room.survivalTime += dt;
    room.spawnTimer += dt;

    for (const spot of room.hidingSpots) {
      spot.pulsePhase += dt * 2.5;
      if (spot.compromisedTimer > 0) {
        spot.compromisedTimer = Math.max(0, spot.compromisedTimer - dt);
      }
    }

    const activePilots = Array.from(room.pilots.values()).filter((p) => p.hp > 0);

    // Spawn waves around random active pilot
    const timeMins = room.survivalTime / 60;
    const baseSpawnRate = Math.max(0.28, 1.25 - timeMins * 0.16);
    const maxEnemies = Math.min(140, 30 + room.pilots.size * 12 + Math.floor(room.survivalTime * 0.4));

    if (activePilots.length > 0 && room.spawnTimer >= baseSpawnRate && room.enemies.length < maxEnemies) {
      room.spawnTimer = 0;
      const count = 1 + Math.floor(Math.random() * (1 + room.survivalTime / 45));
      for (let i = 0; i < count; i++) {
        const anchor = activePilots[Math.floor(Math.random() * activePilots.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = 700 + Math.random() * 180;
        const x = Math.max(50, Math.min(ARENA_WIDTH - 50, anchor.x + Math.cos(angle) * dist));
        const y = Math.max(50, Math.min(ARENA_HEIGHT - 50, anchor.y + Math.sin(angle) * dist));

        const r = Math.random();
        let type: ServerEnemy['type'] = 'drone';
        if (room.survivalTime > 240 && r < 0.2) type = 'brute';
        else if (room.survivalTime > 120 && r < 0.35) type = 'sniper';
        else if (room.survivalTime > 60 && r < 0.55) type = 'weaver';
        else if (r < 0.7) type = 'swarmer';

        createServerEnemy(room, type, x, y);
      }
    }

    // Periodic Co-op Boss encounters
    const hasBoss = room.enemies.some((e) => e.isBoss);
    if (activePilots.length > 0 && room.survivalTime >= room.nextBossTime && !hasBoss) {
      const bossType = room.bossCount % 2 === 0 ? 'boss_goliath' : 'boss_nexus';
      room.bossCount++;
      room.nextBossTime = room.survivalTime + 150;
      const anchor = activePilots[0];
      const angle = Math.random() * Math.PI * 2;
      createServerEnemy(
        room,
        bossType,
        Math.max(100, Math.min(ARENA_WIDTH - 100, anchor.x + Math.cos(angle) * 580)),
        Math.max(100, Math.min(ARENA_HEIGHT - 100, anchor.y + Math.sin(angle) * 580))
      );
      broadcastRoom(room, {
        type: 'boss:warning',
        bossName: bossType === 'boss_nexus' ? 'OVERMIND NEXUS CORE' : 'TITAN CARRIER: GOLIATH',
      });
    }

    // Update enemy AI against online pilots
    for (let i = room.enemies.length - 1; i >= 0; i--) {
      const e = room.enemies[i];
      if (e.hp <= 0) {
        killRoomEnemy(room, e);
        room.enemies.splice(i, 1);
        continue;
      }

      // Find nearest visible pilot (or close proximity reveal <= 52px)
      let targetPilot: ConnectedPilot | null = null;
      let nearestDist = Infinity;

      for (const p of activePilots) {
        const d = Math.hypot(p.x - e.x, p.y - e.y);
        if (p.isHidden && d > 52) continue;
        if (d < nearestDist) {
          nearestDist = d;
          targetPilot = p;
        }
      }

      if (!targetPilot) {
        // All pilots cloaked: patrol nearest lastKnown position
        let patrolTarget: ConnectedPilot | null = activePilots[0] || null;
        let minLastD = Infinity;
        for (const p of activePilots) {
          const d = Math.hypot(p.lastKnownX - e.x, p.lastKnownY - e.y);
          if (d < minLastD) {
            minLastD = d;
            patrolTarget = p;
          }
        }
        if (patrolTarget && minLastD > 80) {
          const seekAngle = Math.atan2(patrolTarget.lastKnownY - e.y, patrolTarget.lastKnownX - e.x);
          e.angle = seekAngle;
          e.vx = Math.cos(seekAngle) * e.speed * 0.65;
          e.vy = Math.sin(seekAngle) * e.speed * 0.65;
        } else {
          e.patrolTimer -= dt;
          if (e.patrolTimer <= 0) {
            e.patrolAngle = Math.random() * Math.PI * 2;
            e.patrolTimer = 1.2 + Math.random() * 1.4;
          }
          e.angle = e.patrolAngle;
          e.vx = Math.cos(e.patrolAngle) * e.speed * 0.45;
          e.vy = Math.sin(e.patrolAngle) * e.speed * 0.45;
        }
        e.x += e.vx * frameStep;
        e.y += e.vy * frameStep;
        continue;
      }

      const angleToTarget = Math.atan2(targetPilot.y - e.y, targetPilot.x - e.x);

      if (e.type === 'weaver') {
        e.specialTimer += dt * 4;
        const weaveAngle = angleToTarget + Math.sin(e.specialTimer) * 1.4;
        e.angle = angleToTarget;
        e.vx = Math.cos(weaveAngle) * e.speed;
        e.vy = Math.sin(weaveAngle) * e.speed;
      } else if (e.type === 'brute') {
        e.attackTimer += dt;
        if (e.isCharging) {
          e.specialTimer -= dt;
          if (e.specialTimer <= 0) {
            e.isCharging = false;
            e.speed = 2.4;
          }
        } else if (e.attackTimer >= 3.5 && nearestDist < 280) {
          e.attackTimer = 0;
          e.isCharging = true;
          e.specialTimer = 0.8;
          e.speed = 8.0;
          e.angle = angleToTarget;
          e.vx = Math.cos(angleToTarget) * e.speed;
          e.vy = Math.sin(angleToTarget) * e.speed;
        } else {
          e.angle = angleToTarget;
          e.vx = Math.cos(angleToTarget) * e.speed;
          e.vy = Math.sin(angleToTarget) * e.speed;
        }
      } else if (e.type === 'sniper') {
        e.angle = angleToTarget;
        e.attackTimer += dt;
        if (nearestDist < 240) {
          e.vx = -Math.cos(angleToTarget) * e.speed;
          e.vy = -Math.sin(angleToTarget) * e.speed;
        } else if (nearestDist > 420) {
          e.vx = Math.cos(angleToTarget) * e.speed;
          e.vy = Math.sin(angleToTarget) * e.speed;
        } else {
          e.vx *= 0.8;
          e.vy *= 0.8;
        }
        if (e.attackTimer >= 2.8) {
          e.attackTimer = 0;
          broadcastRoom(room, {
            type: 'enemy:fire',
            bullets: [
              {
                x: e.x,
                y: e.y,
                vx: Math.cos(angleToTarget) * 11,
                vy: Math.sin(angleToTarget) * 11,
                radius: 5,
                damage: Math.round(e.damage * 1.5),
                color: '#ef4444',
                life: 2.2,
              },
            ],
          });
        }
      } else if (e.type === 'boss_goliath' || e.type === 'boss_nexus') {
        e.angle = e.type === 'boss_nexus' ? e.angle + dt * 1.2 : angleToTarget;
        e.vx = Math.cos(angleToTarget) * e.speed;
        e.vy = Math.sin(angleToTarget) * e.speed;
        e.attackTimer += dt;
        const interval = e.type === 'boss_nexus' ? 1.9 : 2.4;
        if (e.attackTimer >= interval) {
          e.attackTimer = 0;
          const rings = e.type === 'boss_nexus' ? 16 : 12;
          const spd = e.type === 'boss_nexus' ? 6.2 : 5.5;
          const bullets = [];
          for (let r = 0; r < rings; r++) {
            const bAngle = (r / rings) * Math.PI * 2 + (e.type === 'boss_nexus' ? e.angle : room.survivalTime);
            bullets.push({
              x: e.x,
              y: e.y,
              vx: Math.cos(bAngle) * spd,
              vy: Math.sin(bAngle) * spd,
              radius: e.type === 'boss_nexus' ? 7 : 6.5,
              damage: e.type === 'boss_nexus' ? 28 : 22,
              color: e.type === 'boss_nexus' ? '#a855f7' : '#ec4899',
              life: 3.5,
            });
          }
          broadcastRoom(room, { type: 'enemy:fire', bullets });
        }
      } else {
        e.angle = angleToTarget;
        e.vx = Math.cos(angleToTarget) * e.speed;
        e.vy = Math.sin(angleToTarget) * e.speed;
      }

      e.x = Math.max(30, Math.min(ARENA_WIDTH - 30, e.x + e.vx * frameStep));
      e.y = Math.max(30, Math.min(ARENA_HEIGHT - 30, e.y + e.vy * frameStep));
    }

    const activeBoss = room.enemies.find((e) => e.isBoss);
    const snapshot = {
      type: 'room:snapshot',
      roomId: room.roomId,
      survivalTime: room.survivalTime,
      hidingSpots: room.hidingSpots,
      players: Array.from(room.pilots.values()).map((p) => ({
        id: p.id,
        pilotName: p.pilotName,
        shipId: p.shipId,
        shipName: p.shipName,
        color: p.color,
        accentColor: p.accentColor,
        x: Math.round(p.x),
        y: Math.round(p.y),
        angle: Number(p.angle.toFixed(3)),
        hp: Math.round(p.hp),
        maxHp: Math.round(p.maxHp),
        shield: Math.round(p.shield),
        maxShield: Math.round(p.maxShield),
        isHidden: p.isHidden,
        isDashing: p.isDashing,
        level: p.level,
        score: p.score,
        kills: p.kills,
      })),
      enemies: room.enemies.map((e) => ({
        id: e.id,
        type: e.type,
        x: Math.round(e.x),
        y: Math.round(e.y),
        vx: Number(e.vx.toFixed(2)),
        vy: Number(e.vy.toFixed(2)),
        radius: e.radius,
        hp: Math.round(e.hp),
        maxHp: Math.round(e.maxHp),
        speed: e.speed,
        damage: e.damage,
        color: e.color,
        xpValue: e.xpValue,
        angle: Number(e.angle.toFixed(3)),
        attackTimer: Number(e.attackTimer.toFixed(2)),
        isCharging: e.isCharging,
        isBoss: e.isBoss,
      })),
      drops: room.drops,
      boss: activeBoss
        ? {
            name: activeBoss.type === 'boss_nexus' ? 'OVERMIND NEXUS CORE' : 'TITAN CARRIER: GOLIATH',
            hp: Math.max(0, Math.round(activeBoss.hp)),
            maxHp: Math.round(activeBoss.maxHp),
          }
        : null,
    };

    broadcastRoom(room, snapshot);
  }
}, 50);

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, onlinePilots: clients.size, activeRooms: rooms.size });
  });

  app.get('/api/download/standalone', (_req, res) => {
    const standalonePath = path.resolve(__dirname, 'NeonRogue-Game.html');
    if (fs.existsSync(standalonePath)) {
      res.download(standalonePath, 'NeonRogue-Game.html');
      return;
    }
    res.status(404).json({ error: 'Standalone executable not built yet.' });
  });

  app.get('/api/download/launcher/:target', (req, res) => {
    const target = String(req.params.target || '').toLowerCase();
    const map: Record<string, { file: string; downloadName: string }> = {
      windows: { file: 'play-neon-rogue.bat', downloadName: 'play-neon-rogue.bat' },
      mac: { file: 'play-neon-rogue.command', downloadName: 'play-neon-rogue.command' },
      linux: { file: 'neon-rogue', downloadName: 'neon-rogue.sh' },
    };
    const entry = map[target];
    if (!entry) {
      res.status(400).json({ error: 'Invalid launcher target.' });
      return;
    }
    const filePath = path.resolve(__dirname, entry.file);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Launcher file not found.' });
      return;
    }
    res.download(filePath, entry.downloadName);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    const pilotId = `pilot_${nextClientSeq++}`;
    const pilot: ConnectedPilot = {
      id: pilotId,
      ws,
      pilotName: `Pilot-${pilotId.slice(-3)}`,
      shipId: 'striker',
      shipName: 'Striker MK-IV',
      color: '#06b6d4',
      accentColor: '#38bdf8',
      roomId: 'LOBBY',
      status: 'menu',
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      angle: 0,
      hp: 100,
      maxHp: 100,
      shield: 50,
      maxShield: 50,
      isHidden: false,
      isDashing: false,
      level: 1,
      score: 0,
      kills: 0,
      lastKnownX: ARENA_WIDTH / 2,
      lastKnownY: ARENA_HEIGHT / 2,
    };

    clients.set(pilotId, pilot);

    sendJson(ws, {
      type: 'welcome',
      clientId: pilotId,
      globalHistory: globalChatHistory,
    });
    broadcastPresence();

    ws.on('message', (rawData) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        return;
      }

      switch (msg.type) {
        case 'identity:update': {
          pilot.pilotName = sanitizeName(msg.pilotName, pilot.pilotName);
          if (typeof msg.shipName === 'string') {
            pilot.shipName = msg.shipName.slice(0, 48);
          }
          broadcastPresence();
          break;
        }

        case 'room:join': {
          leaveCurrentRoom(pilot);
          const targetRoomId = sanitizeRoomId(msg.roomId);
          const room = getOrCreateRoom(targetRoomId);
          pilot.roomId = targetRoomId;
          pilot.status = 'playing';
          pilot.pilotName = sanitizeName(msg.pilotName, pilot.pilotName);
          pilot.shipId = typeof msg.shipId === 'string' ? msg.shipId.slice(0, 32) : 'striker';
          pilot.shipName = typeof msg.shipName === 'string' ? msg.shipName.slice(0, 48) : 'Striker MK-IV';
          pilot.color = typeof msg.color === 'string' ? msg.color.slice(0, 24) : '#06b6d4';
          pilot.accentColor = typeof msg.accentColor === 'string' ? msg.accentColor.slice(0, 24) : '#38bdf8';
          pilot.x = ARENA_WIDTH / 2 + (Math.random() - 0.5) * 140;
          pilot.y = ARENA_HEIGHT / 2 + (Math.random() - 0.5) * 140;
          pilot.hp = Number(msg.maxHp) || 100;
          pilot.maxHp = Number(msg.maxHp) || 100;
          pilot.shield = Number(msg.maxShield) || 50;
          pilot.maxShield = Number(msg.maxShield) || 50;
          pilot.score = 0;
          pilot.kills = 0;
          pilot.level = 1;
          pilot.isHidden = false;
          pilot.isDashing = false;
          pilot.lastKnownX = pilot.x;
          pilot.lastKnownY = pilot.y;

          room.pilots.set(pilot.id, pilot);

          sendJson(ws, {
            type: 'room:joined',
            roomId: room.roomId,
            spawnX: pilot.x,
            spawnY: pilot.y,
            hidingSpots: room.hidingSpots,
            squadHistory: room.chatHistory,
          });

          pushSquadChat(room, {
            id: `sys_${Date.now()}_${nextChatSeq++}`,
            senderId: 'SYSTEM',
            pilotName: 'SQUAD COMMS',
            shipName: 'Control',
            channel: room.roomId,
            text: `${pilot.pilotName} (${pilot.shipName}) warped into Squad ${room.roomId}.`,
            timestamp: Date.now(),
            isSystem: true,
          });

          broadcastPresence();
          break;
        }

        case 'room:leave': {
          leaveCurrentRoom(pilot);
          broadcastPresence();
          break;
        }

        case 'player:state': {
          if (pilot.roomId === 'LOBBY') break;
          pilot.x = Math.max(20, Math.min(ARENA_WIDTH - 20, Number(msg.x) || pilot.x));
          pilot.y = Math.max(20, Math.min(ARENA_HEIGHT - 20, Number(msg.y) || pilot.y));
          pilot.angle = Number(msg.angle) || 0;
          pilot.hp = Math.max(0, Number(msg.hp) || 0);
          pilot.maxHp = Math.max(1, Number(msg.maxHp) || pilot.maxHp);
          pilot.shield = Math.max(0, Number(msg.shield) || 0);
          pilot.maxShield = Math.max(0, Number(msg.maxShield) || pilot.maxShield);
          pilot.isHidden = Boolean(msg.isHidden);
          pilot.isDashing = Boolean(msg.isDashing);
          pilot.level = Math.max(1, Number(msg.level) || 1);
          pilot.score = Math.max(0, Number(msg.score) || 0);
          pilot.kills = Math.max(0, Number(msg.kills) || 0);
          if (!pilot.isHidden) {
            pilot.lastKnownX = pilot.x;
            pilot.lastKnownY = pilot.y;
          }
          break;
        }

        case 'player:fire': {
          if (pilot.roomId === 'LOBBY') break;
          const room = rooms.get(pilot.roomId);
          if (!room || !Array.isArray(msg.bullets)) break;
          broadcastRoom(
            room,
            {
              type: 'remote:fire',
              pilotId: pilot.id,
              bullets: msg.bullets.slice(0, 12),
            },
            pilot.id
          );
          break;
        }

        case 'player:dash': {
          if (pilot.roomId === 'LOBBY') break;
          const room = rooms.get(pilot.roomId);
          if (!room) break;
          broadcastRoom(
            room,
            {
              type: 'remote:dash',
              pilotId: pilot.id,
              x: Number(msg.x) || pilot.x,
              y: Number(msg.y) || pilot.y,
              color: pilot.accentColor,
            },
            pilot.id
          );
          break;
        }

        case 'enemy:damage': {
          if (pilot.roomId === 'LOBBY') break;
          const room = rooms.get(pilot.roomId);
          if (!room) break;
          const enemyId = Number(msg.enemyId);
          const dmg = Math.max(0, Math.min(5000, Number(msg.damage) || 0));
          const enemy = room.enemies.find((e) => e.id === enemyId);
          if (enemy && dmg > 0) {
            enemy.hp -= dmg;
            enemy.lastDamagedBy = pilot.id;
            if (enemy.hp <= 0) {
              const idx = room.enemies.indexOf(enemy);
              if (idx !== -1) {
                room.enemies.splice(idx, 1);
                killRoomEnemy(room, enemy, pilot.id);
              }
            }
          }
          break;
        }

        case 'drop:collect': {
          if (pilot.roomId === 'LOBBY') break;
          const room = rooms.get(pilot.roomId);
          if (!room) break;
          const dropId = Number(msg.dropId);
          const idx = room.drops.findIndex((d) => d.id === dropId);
          if (idx === -1) break;
          const [drop] = room.drops.splice(idx, 1);
          sendJson(ws, {
            type: 'drop:granted',
            drop,
          });
          if (drop.type === 'nuke') {
            for (let i = room.enemies.length - 1; i >= 0; i--) {
              const e = room.enemies[i];
              if (Math.hypot(e.x - pilot.x, e.y - pilot.y) <= 440) {
                e.hp -= 180;
                e.lastDamagedBy = pilot.id;
                if (e.hp <= 0) {
                  room.enemies.splice(i, 1);
                  killRoomEnemy(room, e, pilot.id);
                }
              }
            }
            broadcastRoom(room, {
              type: 'remote:shockwave',
              x: pilot.x,
              y: pilot.y,
              radius: 440,
              color: '#ec4899',
            });
          }
          break;
        }

        case 'chat:send': {
          const text = sanitizeChatText(msg.text);
          if (!text) break;
          const scope = msg.scope === 'squad' && pilot.roomId !== 'LOBBY' ? pilot.roomId : 'global';
          const chatMsg: ServerChatMsg = {
            id: `msg_${Date.now()}_${nextChatSeq++}`,
            senderId: pilot.id,
            pilotName: sanitizeName(msg.pilotName, pilot.pilotName),
            shipName: typeof msg.shipName === 'string' ? msg.shipName.slice(0, 48) : pilot.shipName,
            channel: scope,
            text,
            timestamp: Date.now(),
          };
          if (scope === 'global') {
            pushGlobalChat(chatMsg);
          } else {
            const room = rooms.get(scope);
            if (room) pushSquadChat(room, chatMsg);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(pilot);
      clients.delete(pilotId);
      broadcastPresence();
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Neon Rogue online server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
