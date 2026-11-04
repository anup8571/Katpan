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
  Share2,
  UserPlus,
  Link2,
  BellRing,
  Mic,
  MicOff,
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

export interface RoomInvitationItem {
  id: string;
  roomCode: string;
  roomName: string;
  fromPlayerName: string;
  fromPlayerId: string;
  targetIdentifier: string;
  createdAt: number;
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
  playerId?: string;
  incomingInvites?: RoomInvitationItem[];
  onAcceptInvite?: (invite: RoomInvitationItem) => void;
  onDismissInvite?: (inviteId: string) => void;
  onJoinRoom: (roomCode: string, seatId?: SeatId) => void;
  onLeaveRoom: () => void;
  onSendChat: (text: string) => void;
  onSelectSeat: (seatId: SeatId) => void;
  onOpenVoiceChat?: () => void;
  isVoiceConnected?: boolean;
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
  playerId,
  incomingInvites = [],
  onAcceptInvite,
  onDismissInvite,
  onJoinRoom,
  onLeaveRoom,
  onSendChat,
  onSelectSeat,
  onOpenVoiceChat,
  isVoiceConnected = false,
}) => {
  const [rooms, setRooms] = useState<MultiplayerRoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [customRoomCode, setCustomRoomCode] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [chatInput, setChatInput] = useState('');

  // Invitation state
  const [inviteTargetInput, setInviteTargetInput] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
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
      setError(null);
      setInviteSuccess(null);
    }
  }, [isOpen, activeRoomCode]);

  if (!isOpen) return null;

  const getInviteUrl = (code: string) => {
    if (typeof window === 'undefined') return code;
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    return url.toString();
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopyInviteLink = (code: string) => {
    const link = getInviteUrl(code);
    navigator.clipboard?.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  const handleNativeShare = async (code: string, name: string) => {
    const link = getInviteUrl(code);
    const shareText = `Join my Royal Katti 3D table "${name}"! Use Room Code: ${code} or click: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Royal Katti Room ${code}`,
          text: shareText,
          url: link,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    handleCopyInviteLink(code);
    setInviteSuccess(`Invite link for ${code} copied to clipboard!`);
  };

  const handleSendPlayerInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoomCode || !inviteTargetInput.trim()) return;
    setError(null);
    setInviteSuccess(null);
    setSendingInvite(true);
    try {
      const target = inviteTargetInput.trim();
      const res = await apiFetch('/api/rooms/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode: activeRoomCode,
          roomName: activeRoomName || `Table ${activeRoomCode}`,
          fromPlayerName: playerName,
          fromPlayerId: playerId || playerName,
          targetIdentifier: target,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send room invitation.');
      } else {
        setInviteTargetInput('');
        setInviteSuccess(
          `Invite sent to "${target}" with Room Code ${activeRoomCode}!`
        );
      }
    } catch {
      setError('Could not send room invitation.');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInviteSuccess(null);
    setCreatingRoom(true);
    try {
      const res = await apiFetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: newRoomName.trim() || `${playerName}'s Royal Table`,
          customCode: customRoomCode.trim() || undefined,
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
        setCustomRoomCode('');
        onJoinRoom(data.room.roomCode, humanSeat);
        setInviteSuccess(
          `Room ${data.room.roomCode} created! Share the code below to invite players.`
        );
      }
    } catch {
      setError('Could not create room.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = joinCodeInput
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '');
    if (!cleaned) {
      setError('Please enter a Room Code (e.g. RK-ROYAL).');
      return;
    }
    setError(null);
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
      aria-label="Multiplayer Lobby and Room Invitations"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950/90 backdrop-blur-xl border border-white/15 p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white flex items-center gap-2">
                <span>MULTIPLAYER ROOMS &amp; INVITES</span>
                {activeRoomCode && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                    <Radio className="w-3 h-3 animate-pulse" />
                    {activeRoomCode}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                Invite friends via Room Code, Invite Link, or Player ID
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
          <div className="rounded-xl bg-rose-950/75 border border-rose-400/50 px-3.5 py-2.5 text-xs text-rose-200 font-medium">
            {error}
          </div>
        )}

        {inviteSuccess && (
          <div className="rounded-xl bg-emerald-950/75 border border-emerald-400/50 px-3.5 py-2.5 text-xs text-emerald-200 font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{inviteSuccess}</span>
          </div>
        )}

        {/* Incoming Room Invitations Section */}
        {incomingInvites.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/40 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-300 uppercase tracking-wider">
              <BellRing className="w-3.5 h-3.5 animate-bounce" />
              <span>Incoming Room Invitations ({incomingInvites.length})</span>
            </div>
            <div className="flex flex-col gap-2">
              {incomingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl bg-slate-900/90 border border-amber-400/30 p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      <span className="text-amber-300">{inv.fromPlayerName}</span> invited you to{' '}
                      <span className="text-emerald-300">{inv.roomName}</span>
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      Room Code: <b className="text-amber-300">{inv.roomCode}</b>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAcceptInvite?.(inv)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs cursor-pointer transition-all"
                    >
                      Accept &amp; Join
                    </button>
                    {onDismissInvite && (
                      <button
                        type="button"
                        onClick={() => onDismissInvite(inv.id)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                        title="Dismiss Invite"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Room Panel (When Connected to a Room) */}
        {activeRoomCode ? (
          <div className="flex flex-col gap-3">
            {/* Room Code & Share Invitation Card */}
            <div className="rounded-xl bg-emerald-950/35 border border-emerald-400/40 p-3.5 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider block">
                    Active Room • Share Code to Invite Players
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-black text-white">
                      {activeRoomName || activeRoomCode}
                    </span>
                    <span className="font-mono text-sm font-black text-amber-300 bg-slate-900/90 px-2.5 py-0.5 rounded-lg border border-amber-400/40 tracking-wider">
                      {activeRoomCode}
                    </span>
                  </div>
                </div>

                <button
                  onClick={onLeaveRoom}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-xs font-bold text-rose-200 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Leave</span>
                </button>
              </div>

              {/* 1-Click Copy Code, Copy Invite Link & Share Buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleCopyCode(activeRoomCode)}
                  className="py-2 px-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-xs font-bold text-amber-200 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  {copiedCode ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-amber-300" />
                  )}
                  <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyInviteLink(activeRoomCode)}
                  className="py-2 px-2.5 rounded-xl bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/40 text-xs font-bold text-sky-200 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  {copiedLink ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5 text-sky-300" />
                  )}
                  <span>{copiedLink ? 'Link Copied!' : 'Invite Link'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleNativeShare(activeRoomCode, activeRoomName || activeRoomCode)
                  }
                  className="py-2 px-2.5 rounded-xl bg-emerald-400/15 hover:bg-emerald-400/25 border border-emerald-400/40 text-xs font-bold text-emerald-200 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Share Invite</span>
                </button>
              </div>

              {/* Table Voice Chat Banner / Button */}
              {onOpenVoiceChat && (
                <button
                  type="button"
                  onClick={onOpenVoiceChat}
                  className={`w-full py-2.5 px-3.5 rounded-xl border flex items-center justify-between text-xs font-bold cursor-pointer transition-all ${
                    isVoiceConnected
                      ? 'bg-emerald-950/60 border-emerald-400/50 text-emerald-200 hover:bg-emerald-900/60'
                      : 'bg-slate-900/80 border-amber-400/30 text-amber-200 hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                        isVoiceConnected
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" />
                    </div>
                    <span>
                      {isVoiceConnected ? 'Table Voice Chat Active' : 'Join Table Voice Chat'}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-white/10 text-white">
                    {isVoiceConnected ? 'Open Settings' : 'Connect'}
                  </span>
                </button>
              )}

              {/* Direct In-App Player Invitation by Player ID or Email */}
              <form
                onSubmit={handleSendPlayerInvite}
                className="pt-2.5 border-t border-white/10 flex flex-col gap-1.5"
              >
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-amber-300" />
                  <span>Invite Player Directly by Player ID or Email</span>
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteTargetInput}
                    onChange={(e) => setInviteTargetInput(e.target.value)}
                    placeholder="Enter friend's Player ID (e.g. anup_357) or Email"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    disabled={sendingInvite || !inviteTargetInput.trim()}
                    className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-300 to-amber-400 hover:brightness-105 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{sendingInvite ? 'Sending...' : 'Invite'}</span>
                  </button>
                </div>
              </form>
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
                    No messages yet. Share code {activeRoomCode} to invite friends!
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
          /* Create or Join Room by Code Controls */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <form
              onSubmit={handleJoinByCode}
              className="rounded-xl bg-sky-500/10 border border-sky-400/30 p-3.5 flex flex-col justify-between gap-2.5"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-black text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Join via Room Code</span>
                </span>
                <p className="text-[11px] text-slate-400">
                  Have an invite code from a friend? Enter it below to join their table:
                </p>
                <input
                  type="text"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  placeholder="Enter Code (e.g. RK-4829)"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-xs font-mono uppercase tracking-wider text-white focus:outline-none focus:border-sky-400 mt-0.5"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-3 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 to-cyan-400 hover:brightness-110 cursor-pointer transition-all shadow-md"
              >
                JOIN ROOM BY CODE
              </button>
            </form>

            <form
              onSubmit={handleCreateRoom}
              className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3.5 flex flex-col justify-between gap-2"
            >
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Room &amp; Get Code</span>
                </span>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Table Name (e.g. Royal VIP)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
                />
                <input
                  type="text"
                  value={customRoomCode}
                  onChange={(e) =>
                    setCustomRoomCode(
                      e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12)
                    )
                  }
                  placeholder="Optional Custom Code (or auto RK-XXXX)"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs font-mono uppercase text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                disabled={creatingRoom}
                className="w-full py-2.5 px-3 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-amber-300 to-yellow-400 hover:brightness-110 cursor-pointer transition-all shadow-md"
              >
                {creatingRoom ? 'CREATING...' : 'CREATE & GET INVITE CODE'}
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
