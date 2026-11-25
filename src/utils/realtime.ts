import {
  ChatMessageItem,
  OnlinePilotSummary,
  OnlineRoomInfo,
  RemotePlayerState,
} from '../types';
import type { DropItem, Enemy, HidingSpot } from '../game/engine';

export interface RoomSnapshotPayload {
  roomId: string;
  survivalTime: number;
  hidingSpots: HidingSpot[];
  players: RemotePlayerState[];
  enemies: Enemy[];
  drops: DropItem[];
  boss: { name: string; hp: number; maxHp: number } | null;
}

export interface RemoteBulletPayload {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  isCrit?: number;
  color: string;
  life?: number;
}

export interface RealtimeListeners {
  onConnectionChange?: (connected: boolean, clientId: string | null) => void;
  onPresence?: (onlineCount: number, pilots: OnlinePilotSummary[], rooms: OnlineRoomInfo[]) => void;
  onChatHistory?: (messages: ChatMessageItem[]) => void;
  onChatMessage?: (message: ChatMessageItem) => void;
  onRoomJoined?: (payload: {
    roomId: string;
    spawnX: number;
    spawnY: number;
    hidingSpots: HidingSpot[];
    squadHistory: ChatMessageItem[];
  }) => void;
  onRoomSnapshot?: (snapshot: RoomSnapshotPayload) => void;
  onRemoteFire?: (pilotId: string, bullets: RemoteBulletPayload[]) => void;
  onEnemyFire?: (bullets: RemoteBulletPayload[]) => void;
  onRemoteDash?: (payload: { pilotId: string; x: number; y: number; color: string }) => void;
  onRemoteShockwave?: (payload: { x: number; y: number; radius: number; color: string }) => void;
  onEnemyKilled?: (payload: {
    enemyId: number;
    x: number;
    y: number;
    color: string;
    isBoss: boolean;
    xpValue: number;
    killerId: string;
  }) => void;
  onDropGranted?: (drop: DropItem) => void;
  onBossWarning?: (bossName: string) => void;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private queue: string[] = [];
  private listeners = new Set<RealtimeListeners>();
  public clientId: string | null = null;
  public connected = false;
  private currentIdentity: { pilotName: string; shipName: string } | null = null;

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const isFile = window.location.protocol === 'file:';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isFile ? 'localhost:3000' : window.location.host;
    const url = `${protocol}//${host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.connected = true;
        if (this.currentIdentity) {
          this.send({ type: 'identity:update', ...this.currentIdentity });
        }
        while (this.queue.length > 0 && ws.readyState === WebSocket.OPEN) {
          const item = this.queue.shift();
          if (item) ws.send(item);
        }
        for (const l of this.listeners) {
          l.onConnectionChange?.(true, this.clientId);
        }
      };

      ws.onmessage = (event) => {
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(String(event.data));
        } catch {
          return;
        }

        switch (data.type) {
          case 'welcome': {
            this.clientId = String(data.clientId || '');
            for (const l of this.listeners) {
              l.onConnectionChange?.(true, this.clientId);
              if (Array.isArray(data.globalHistory)) {
                l.onChatHistory?.(data.globalHistory as ChatMessageItem[]);
              }
            }
            break;
          }
          case 'presence:update': {
            for (const l of this.listeners) {
              l.onPresence?.(
                Number(data.onlineCount || 0),
                (data.pilots as OnlinePilotSummary[]) || [],
                (data.rooms as OnlineRoomInfo[]) || []
              );
            }
            break;
          }
          case 'chat:message': {
            const msg = data.message as ChatMessageItem | undefined;
            if (msg) {
              for (const l of this.listeners) {
                l.onChatMessage?.(msg);
              }
            }
            break;
          }
          case 'room:joined': {
            for (const l of this.listeners) {
              l.onRoomJoined?.({
                roomId: String(data.roomId || 'PUBLIC'),
                spawnX: Number(data.spawnX || 1200),
                spawnY: Number(data.spawnY || 1200),
                hidingSpots: (data.hidingSpots as HidingSpot[]) || [],
                squadHistory: (data.squadHistory as ChatMessageItem[]) || [],
              });
            }
            break;
          }
          case 'room:snapshot': {
            for (const l of this.listeners) {
              l.onRoomSnapshot?.(data as unknown as RoomSnapshotPayload);
            }
            break;
          }
          case 'remote:fire': {
            for (const l of this.listeners) {
              l.onRemoteFire?.(
                String(data.pilotId || ''),
                (data.bullets as RemoteBulletPayload[]) || []
              );
            }
            break;
          }
          case 'enemy:fire': {
            for (const l of this.listeners) {
              l.onEnemyFire?.((data.bullets as RemoteBulletPayload[]) || []);
            }
            break;
          }
          case 'remote:dash': {
            for (const l of this.listeners) {
              l.onRemoteDash?.({
                pilotId: String(data.pilotId || ''),
                x: Number(data.x || 0),
                y: Number(data.y || 0),
                color: String(data.color || '#38bdf8'),
              });
            }
            break;
          }
          case 'remote:shockwave': {
            for (const l of this.listeners) {
              l.onRemoteShockwave?.({
                x: Number(data.x || 0),
                y: Number(data.y || 0),
                radius: Number(data.radius || 120),
                color: String(data.color || '#ec4899'),
              });
            }
            break;
          }
          case 'enemy:killed': {
            for (const l of this.listeners) {
              l.onEnemyKilled?.({
                enemyId: Number(data.enemyId || 0),
                x: Number(data.x || 0),
                y: Number(data.y || 0),
                color: String(data.color || '#22d3ee'),
                isBoss: Boolean(data.isBoss),
                xpValue: Number(data.xpValue || 10),
                killerId: String(data.killerId || ''),
              });
            }
            break;
          }
          case 'drop:granted': {
            if (data.drop) {
              for (const l of this.listeners) {
                l.onDropGranted?.(data.drop as DropItem);
              }
            }
            break;
          }
          case 'boss:warning': {
            for (const l of this.listeners) {
              l.onBossWarning?.(String(data.bossName || 'DREADNOUGHT'));
            }
            break;
          }
        }
      };

      ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        for (const l of this.listeners) {
          l.onConnectionChange?.(false, this.clientId);
        }
        if (!this.reconnectTimer) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 1500);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // retry via timer
    }
  }

  public subscribe(listener: RealtimeListeners): () => void {
    this.listeners.add(listener);
    this.connect();
    listener.onConnectionChange?.(this.connected, this.clientId);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public send(payload: unknown, allowQueue = true) {
    const encoded = JSON.stringify(payload);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encoded);
    } else if (allowQueue) {
      if (this.queue.length < 40) {
        this.queue.push(encoded);
      }
      this.connect();
    }
  }

  public updateIdentity(pilotName: string, shipName: string) {
    this.currentIdentity = { pilotName, shipName };
    this.send({ type: 'identity:update', pilotName, shipName });
  }

  public sendChat(text: string, scope: 'global' | 'squad', pilotName: string, shipName: string) {
    this.send({ type: 'chat:send', text, scope, pilotName, shipName });
  }

  public joinRoom(payload: {
    roomId: string;
    pilotName: string;
    shipId: string;
    shipName: string;
    color: string;
    accentColor: string;
    maxHp: number;
    maxShield: number;
  }) {
    this.send({ type: 'room:join', ...payload });
  }

  public leaveRoom() {
    this.send({ type: 'room:leave' });
  }
}

export const realtimeClient = new RealtimeClient();
