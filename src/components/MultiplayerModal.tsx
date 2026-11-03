import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Plus,
  LogIn,
  Copy,
  Check,
  Send,
  RefreshCw,
  Radio,
  Crown,
  Scissors,
  LogOut,
} from 'lucide-react';
import { SeatId } from '../game/types';
import { apiFetch } from '../utils/apiClient';

export interface MultiplayerRoomSummary {
  roomCode: string;
  roomName: string;
  hostName: string;
  dealerSeat: SeatId;
  cutterSeat: SeatId;
  phase: string;
  playerCount: number;
  maxPlayers: number;
  occupiedSeats: Record<string, string>;
  isPublic: boolean;
}

export interface RoomChatMessage {
  id: string;
  sender: string;
  seatId: SeatId;
  text: string;
  timestamp: number;
}

interface MultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoomCode: string | null;
  activeRoomName: string | null;
  occupiedSeats: Record<string, string>;
  chatMessages: RoomChatMessage[];
  humanSeat: SeatId;
  playerName: string;
  onJoinRoom: (roomCode: string, seatId?: SeatId) => void;
  onLeaveRoom: () => void;
  onSendChat: (text: string) => void;
  onSelectSeat: (seatId: SeatId) => void;
}

const QUICK_EMOTES = [
  '👑 King of Andar!',
  '✂️ Clean Bahar Cut!',
  '🔥 Big RC Wager!',
  '👏 Great Hand!',
];

export const MultiplayerModal: React.FC<MultiplayerModalProps> = ({
  isOpen,
  onClose,
  activeRoomCode,
  activeRoomName,
  occupiedSeats,
  chatMessages,
  humanSeat,
  playerName,
  onJoinRoom,
  onLeaveRoom,
  onSendChat,
  onSelectSeat,
}) => {
  const [rooms, setRooms] = useState<MultiplayerRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await apiFetch('/api/rooms');
      if (res.ok) {
        const data = await res.json();
        setRooms(data.rooms || []);
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRooms();
    }
  }, [isOpen, activeRoomCode]);

  if (!isOpen) return null;

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreatingRoom(true);
    try {
      const res = await apiFetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: newRoomName.trim() || `${playerName}'s Royal Table`,
          hostName: playerName,
          preferredSeat: humanSeat,
          isPublic: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create room.');
      } else if (data.room?.roomCode) {
        setNewRoomName('');
        onJoinRoom(data.room.roomCode, humanSeat);
      }
    } catch {
      setError('Could not create room.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCodeInput.trim().toUpperCase();
    if (!cleaned) return;
    onJoinRoom(cleaned, humanSeat);
    setJoinCodeInput('');
  };

  const handleSendChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const ALL_SEATS: SeatId[] = ['A', 'B', 'C', 'D', 'E', 'F'];

  return (
    <div
      role="dialog"
      aria-label="Multiplayer Lobby and Live Rooms"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950/75 backdrop-blur-xl border border-white/15 p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white flex items-center gap-2">
                <span>MULTIPLAYER 6-SEAT LOBBY</span>
                {activeRoomCode && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    <Radio className="w-3 h-3 animate-pulse" />
                    {activeRoomCode}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                Real-Time WebSocket Sync • Empty seats auto-filled by smart bots
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Multiplayer Modal"
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-rose-950/70 border border-rose-400/50 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        {/* Active Room Panel (When Connected to a Room) */}
        {activeRoomCode ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl bg-emerald-950/35 border border-emerald-400/40 p-3 flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">
                  Connected Live Room
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-black text-white">
                    {activeRoomName || activeRoomCode}
                  </span>
                  <span className="font-mono text-xs font-black text-amber-300 bg-slate-900/80 px-2 py-0.5 rounded border border-amber-400/30">
                    {activeRoomCode}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(activeRoomCode);
                    setCopiedRoom(true);
                    setTimeout(() => setCopiedRoom(false), 1500);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  {copiedRoom ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedRoom ? 'Copied' : 'Code'}</span>
                </button>

                <button
                  onClick={onLeaveRoom}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-xs font-bold text-rose-200 flex items-center gap-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Solo Mode</span>
                </button>
              </div>
            </div>

            {/* Live 6-Seat Occupancy Map */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Live Table Seats (Tap to Switch Seat)
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {ALL_SEATS.map((seatId) => {
                  const occupant = occupiedSeats[seatId];
                  const isYou = seatId === humanSeat;
                  return (
                    <button
                      key={seatId}
                      onClick={() => onSelectSeat(seatId)}
                      className={`p-2 rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all ${
                        isYou
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                          : occupant
                          ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
                          : 'bg-slate-900/70 border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-black">Seat {seatId}</span>
                      <span className="text-[9px] font-bold truncate max-w-full">
                        {isYou ? 'YOU' : occupant || 'Bot AI'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Room Chat & Quick Emotes */}
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2.5">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Live Table Chat &amp; Quick Emotes
              </span>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_EMOTES.map((emote) => (
                  <button
                    key={emote}
                    type="button"
                    onClick={() => onSendChat(emote)}
                    className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-amber-500/20 border border-white/10 hover:border-amber-400/40 text-[10px] font-bold text-slate-200 cursor-pointer transition-all"
                  >
                    {emote}
                  </button>
                ))}
              </div>

              <div className="h-28 overflow-y-auto rounded-xl bg-slate-950/70 border border-white/5 p-2.5 flex flex-col gap-1.5">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center my-auto">
                    No messages yet. Say hello to the table!
                  </p>
                ) : (
                  chatMessages.map((m) => (
                    <div key={m.id} className="text-xs flex items-baseline gap-1.5">
                      <span className="font-black text-amber-300 shrink-0">
                        [{m.seatId}] {m.sender}:
                      </span>
                      <span className="text-slate-200 break-words">{m.text}</span>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendChatSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send message to table..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <button
                  type="submit"
                  aria-label="Send Chat Message"
                  className="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Create or Join Room Controls */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <form
              onSubmit={handleCreateRoom}
              className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2"
            >
              <span className="text-[11px] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Table</span>
              </span>
              <input
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g. Royal High Rollers"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                disabled={creatingRoom}
                className="w-full py-2 px-3 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-amber-300 to-yellow-400 hover:brightness-110 cursor-pointer transition-all"
              >
                {creatingRoom ? 'CREATING...' : 'CREATE & HOST ROOM'}
              </button>
            </form>

            <form
              onSubmit={handleJoinByCode}
              className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2"
            >
              <span className="text-[11px] font-black text-sky-300 uppercase tracking-wider flex items-center gap-1">
                <LogIn className="w-3.5 h-3.5" />
                <span>Join by Room Code</span>
              </span>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value)}
                placeholder="e.g. RK-ROYAL"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs font-mono uppercase text-white focus:outline-none focus:border-sky-400"
              />
              <button
                type="submit"
                className="w-full py-2 px-3 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 to-cyan-400 hover:brightness-110 cursor-pointer transition-all"
              >
                JOIN WITH CODE
              </button>
            </form>
          </div>
        )}

        {/* Public Multiplayer Rooms Directory */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Live Public Rooms ({rooms.length})
            </span>
            <button
              onClick={fetchRooms}
              aria-label="Refresh Rooms"
              className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex flex-col gap-2 max-h-44 overflow-y-auto pr-1">
            {rooms.map((r) => {
              const isCurrent = r.roomCode === activeRoomCode;
              return (
                <div
                  key={r.roomCode}
                  className={`flex items-center justify-between gap-2 rounded-xl p-2.5 border transition-all ${
                    isCurrent
                      ? 'bg-emerald-950/50 border-emerald-400/50'
                      : 'bg-slate-900/75 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-white truncate">
                        {r.roomName}
                      </span>
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-amber-300">
                        {r.roomCode}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                      <span className="flex items-center gap-0.5 text-amber-300">
                        <Crown className="w-3 h-3" /> Under: {r.dealerSeat}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 text-sky-300">
                        <Scissors className="w-3 h-3" /> Cutter: {r.cutterSeat}
                      </span>
                      <span>•</span>
                      <span>{r.playerCount}/6 Players</span>
                    </div>
                  </div>

                  {isCurrent ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black shrink-0">
                      JOINED
                    </span>
                  ) : (
                    <button
                      onClick={() => onJoinRoom(r.roomCode, humanSeat)}
                      className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs cursor-pointer transition-all shrink-0"
                    >
                      Join
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
