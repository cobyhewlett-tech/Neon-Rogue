import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChatMessageItem } from '../types';
import { MessageSquare, Send, Radio, ChevronDown, ChevronUp, Users } from 'lucide-react';

interface LiveChatPanelProps {
  variant: 'lobby' | 'hud';
  messages: ChatMessageItem[];
  squadRoomId?: string;
  onlineCount: number;
  isConnected: boolean;
  pilotName: string;
  onSendMessage: (text: string, scope: 'global' | 'squad') => void;
}

export const LiveChatPanel: React.FC<LiveChatPanelProps> = ({
  variant,
  messages,
  squadRoomId,
  onlineCount,
  isConnected,
  pilotName,
  onSendMessage,
}) => {
  const [scope, setScope] = useState<'global' | 'squad'>(squadRoomId ? 'squad' : 'global');
  const [draft, setDraft] = useState('');
  const [isOpen, setIsOpen] = useState(variant === 'lobby');
  const [unreadCount, setUnreadCount] = useState(0);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevCountRef = useRef(messages.length);

  // Sync default scope when squad changes
  useEffect(() => {
    if (!squadRoomId && scope === 'squad') {
      setScope('global');
    }
  }, [squadRoomId, scope]);

  const filteredMessages = useMemo(() => {
    if (scope === 'squad' && squadRoomId) {
      return messages.filter((m) => m.channel === squadRoomId);
    }
    return messages.filter((m) => m.channel === 'global');
  }, [messages, scope, squadRoomId]);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      if (!isOpen && variant === 'hud') {
        setUnreadCount((c) => c + (messages.length - prevCountRef.current));
      }
    }
    prevCountRef.current = messages.length;
  }, [messages.length, isOpen, variant]);

  useEffect(() => {
    if (isOpen && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [filteredMessages.length, isOpen, scope]);

  const handleToggleOpen = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) setUnreadCount(0);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    const effectiveScope = scope === 'squad' && squadRoomId ? 'squad' : 'global';
    onSendMessage(trimmed, effectiveScope);
    setDraft('');
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (variant === 'hud' && !isOpen) {
    const latest = filteredMessages[filteredMessages.length - 1] || messages[messages.length - 1];
    return (
      <div className="pointer-events-auto flex flex-col items-end gap-1.5">
        {latest && (
          <div className="max-w-[260px] px-2.5 py-1 rounded-lg bg-slate-950/75 border border-slate-800/80 text-[11px] font-mono text-slate-300 truncate backdrop-blur-sm">
            <span className="text-cyan-400 font-bold">{latest.pilotName}: </span>
            <span>{latest.text}</span>
          </div>
        )}
        <button
          id="btn-hud-chat-toggle"
          type="button"
          onClick={handleToggleOpen}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/90 text-xs font-mono font-bold text-cyan-300 shadow-lg backdrop-blur-md transition-colors cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          <span>LIVE CHAT</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div
      id={variant === 'lobby' ? 'lobby-live-chat' : 'hud-live-chat'}
      className={
        variant === 'lobby'
          ? 'flex flex-col rounded-3xl bg-slate-900/85 border border-slate-800 p-4 gap-3 shadow-xl'
          : 'pointer-events-auto w-80 flex flex-col rounded-2xl bg-slate-950/90 border border-slate-800 p-3 gap-2.5 shadow-2xl backdrop-blur-md'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/90 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Radio className={`w-4 h-4 shrink-0 ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span className="text-xs font-mono font-bold text-white tracking-wider truncate">
            LIVE COMMS
          </span>
          <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
            <Users className="w-3 h-3 text-cyan-400" />
            {onlineCount}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {squadRoomId && (
            <>
              <button
                type="button"
                onClick={() => setScope('squad')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                  scope === 'squad'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                SQUAD
              </button>
              <button
                type="button"
                onClick={() => setScope('global')}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                  scope === 'global'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                GLOBAL
              </button>
            </>
          )}
          {variant === 'hud' && (
            <button
              type="button"
              onClick={handleToggleOpen}
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Minimize Chat"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div
        ref={feedRef}
        className={`flex flex-col gap-1.5 overflow-y-auto pr-1 text-xs font-sans ${
          variant === 'lobby' ? 'h-48' : 'h-36'
        }`}
      >
        {filteredMessages.length === 0 ? (
          <div className="m-auto text-center text-[11px] font-mono text-slate-500 px-3">
            {scope === 'squad' && squadRoomId
              ? `Squad ${squadRoomId} channel open. Say hello to your wingmates!`
              : 'Global frequency clear. Say hello to pilots online!'}
          </div>
        ) : (
          filteredMessages.map((msg) => (
            <div
              key={msg.id}
              className={`leading-snug break-words rounded-lg px-2 py-1 ${
                msg.isSystem
                  ? 'bg-slate-950/70 text-emerald-300 font-mono text-[11px] border border-emerald-500/20'
                  : 'bg-slate-950/60 text-slate-200'
              }`}
            >
              {!msg.isSystem && (
                <span className="font-mono text-[10px] text-slate-500 mr-1.5 tabular-nums">
                  {formatTime(msg.timestamp)}
                </span>
              )}
              <span
                className={`font-mono font-bold text-[11px] mr-1.5 ${
                  msg.isSystem
                    ? 'text-emerald-400'
                    : msg.pilotName === pilotName
                    ? 'text-amber-300'
                    : 'text-cyan-300'
                }`}
              >
                {msg.pilotName}:
              </span>
              <span className="text-slate-200">{msg.text}</span>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          id={variant === 'lobby' ? 'input-lobby-chat' : 'input-hud-chat'}
          type="text"
          value={draft}
          maxLength={240}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              e.currentTarget.blur();
            }
          }}
          placeholder={
            scope === 'squad' && squadRoomId
              ? `Message Squad ${squadRoomId}...`
              : 'Broadcast to Global Comms...'
          }
          className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-cyan-500/60 focus:outline-none text-xs text-slate-100 placeholder:text-slate-500 font-sans"
        />
        <button
          id={variant === 'lobby' ? 'btn-lobby-chat-send' : 'btn-hud-chat-send'}
          type="submit"
          disabled={!draft.trim()}
          className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-mono font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </div>
  );
};
