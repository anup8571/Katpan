import React, { useState } from 'react';
import { Card, SeatId, SeatInfo } from '../game/types';
import {
  Crown,
  Scissors,
  Coins,
  Users,
  User,
  Settings,
  Wifi,
  Copy,
  Check,
  BellRing,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import { RoomInvitationItem } from './MultiplayerModal';

interface HUDProps {
  balance: number;
  pointCard: Card | null;
  dealerSeat: SeatId;
  cutterSeat: SeatId;
  humanSeat: SeatId;
  activeActorSeat: SeatId | null;
  seats: SeatInfo[];
  onSelectHumanSeat: (seatId: SeatId) => void;
  announcement: string;
  userDisplayName?: string | null;
  isAuthenticated: boolean;
  activeRoomCode: string | null;
  roomPlayerCount: number;
  occupiedSeats?: Record<string, string>;
  incomingInvite?: RoomInvitationItem | null;
  onAcceptInvite?: (invite: RoomInvitationItem) => void;
  onDismissInvite?: (inviteId: string) => void;
  onOpenMultiplayer: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  balance,
  pointCard,
  dealerSeat,
  cutterSeat,
  humanSeat,
  activeActorSeat,
  seats,
  onSelectHumanSeat,
  announcement,
  userDisplayName,
  isAuthenticated,
  activeRoomCode,
  roomPlayerCount,
  occupiedSeats = {},
  incomingInvite,
  onAcceptInvite,
  onDismissInvite,
  onOpenMultiplayer,
  onOpenProfile,
  onOpenSettings,
}) => {
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);

  const dealerIsYou = dealerSeat === humanSeat;
  const cutterIsYou = cutterSeat === humanSeat;
  const isRedPoint =
    pointCard?.suit === 'hearts' || pointCard?.suit === 'diamonds';

  const handleQuickCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeRoomCode) return;
    navigator.clipboard?.writeText(activeRoomCode);
    setCopiedRoomCode(true);
    setTimeout(() => setCopiedRoomCode(false), 1600);
  };

  return (
    <div className="fixed inset-x-0 top-0 pointer-events-none z-20 flex flex-col p-2.5 sm:p-4 select-none">
      {/* Sleek Transparent Floating Top Row — No heavy header box */}
      <div className="flex items-center justify-between gap-2 max-w-6xl mx-auto w-full">
        {/* Left Floating Glass Capsule: Brand + Active Roles + Hukam */}
        <div className="pointer-events-auto flex items-center gap-2 bg-slate-950/35 backdrop-blur-md border border-white/15 rounded-2xl px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          <div className="flex items-center gap-1.5 pr-2 border-r border-white/10">
            <Crown className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-xs sm:text-sm font-black tracking-wider text-white whitespace-nowrap">
              ROYAL KATTI
            </span>
          </div>

          {/* Live Under & Cutter Role Pills */}
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                dealerIsYou
                  ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                  : 'bg-white/5 border-white/10 text-amber-300/90'
              }`}
              title="Under (Shuffler / Dealer)"
            >
              <Crown className="w-3 h-3 text-amber-400" />
              <span>Under: {dealerSeat}</span>
            </span>

            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border ${
                cutterIsYou
                  ? 'bg-sky-500/25 border-sky-400/60 text-sky-200'
                  : 'bg-white/5 border-white/10 text-sky-300/90'
              }`}
              title="Bahar (Cutter)"
            >
              <Scissors className="w-3 h-3 text-sky-400" />
              <span>Cutter: {cutterSeat}</span>
            </span>

            {pointCard && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-200 font-black">
                <span>Hukam:</span>
                <span className={isRedPoint ? 'text-rose-400' : 'text-white'}>
                  {pointCard.label}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Center Compact Transparent Seat Switcher (Desktop) */}
        <div className="hidden lg:flex pointer-events-auto items-center gap-1 bg-slate-950/30 backdrop-blur-md border border-white/10 rounded-2xl px-2 py-1 shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
          {seats.map((seat) => {
            const isD = seat.id === dealerSeat;
            const isC = seat.id === cutterSeat;
            const isH = seat.id === humanSeat;
            const isActing = seat.id === activeActorSeat;
            const remotePlayer = occupiedSeats[seat.id];

            return (
              <button
                key={seat.id}
                onClick={() => onSelectHumanSeat(seat.id)}
                title={`Seat ${seat.id} • ${seat.balance} RC${remotePlayer ? ` • ${remotePlayer}` : ''}`}
                className={`relative px-2 py-1 rounded-xl text-[10px] font-black transition-all cursor-pointer flex items-center gap-1 border ${
                  isH
                    ? 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200'
                    : isD
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                      : isC
                        ? 'bg-sky-500/20 border-sky-400/40 text-sky-200'
                        : 'bg-white/5 border-transparent text-slate-300 hover:bg-white/10'
                } ${isActing ? 'ring-1 ring-amber-400' : ''}`}
              >
                <span>{seat.id}</span>
                {isD && <span className="text-[9px]">👑</span>}
                {isC && <span className="text-[9px]">✂️</span>}
                {remotePlayer && !isH && (
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right Floating Glass Capsule: Balance + Multiplayer/Invite + Profile + Settings */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
          {/* RC Balance Pill */}
          <div
            data-testid="balance-display"
            className="flex items-center gap-1.5 bg-slate-950/35 backdrop-blur-md border border-emerald-400/30 rounded-2xl px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
          >
            <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm font-black text-emerald-300 tabular-nums whitespace-nowrap">
              {balance.toLocaleString()} RC
            </span>
          </div>

          {/* Multiplayer Lobby & Quick Copy Room Code Button */}
          <div className="flex items-center gap-1">
            <button
              data-testid="multiplayer-btn"
              onClick={onOpenMultiplayer}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl backdrop-blur-md border transition-all cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.45)] ${
                activeRoomCode
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-200 hover:bg-sky-500/35'
                  : 'bg-slate-950/35 border-white/15 text-slate-200 hover:bg-white/10 hover:border-white/25'
              }`}
              title="Multiplayer Rooms & Invite Players via Room Code"
            >
              {activeRoomCode ? (
                <Wifi className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              ) : (
                <Users className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span className="hidden sm:inline text-xs font-bold tracking-wide">
                {activeRoomCode
                  ? `${activeRoomCode} (${roomPlayerCount})`
                  : 'Invite / Rooms'}
              </span>
            </button>

            {activeRoomCode && (
              <button
                type="button"
                onClick={handleQuickCopyCode}
                title={`Copy Room Code ${activeRoomCode} to invite friends`}
                className="p-2 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 backdrop-blur-md border border-amber-400/40 text-amber-300 transition-all cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
              >
                {copiedRoomCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          {/* Profile / Auth Button */}
          <button
            data-testid="profile-btn"
            onClick={onOpenProfile}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl backdrop-blur-md border transition-all cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.45)] ${
              isAuthenticated
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30'
                : 'bg-slate-950/35 border-white/15 text-slate-200 hover:bg-white/10 hover:border-white/25'
            }`}
            title="Player Profile & Email Account"
          >
            <User className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline text-xs font-bold tracking-wide max-w-[96px] truncate">
              {isAuthenticated && userDisplayName ? userDisplayName : 'Profile'}
            </span>
          </button>

          <PWAInstallButton compact />

          {/* Settings Button */}
          <button
            data-testid="settings-btn"
            onClick={onOpenSettings}
            className="p-2 rounded-2xl bg-slate-950/35 backdrop-blur-md border border-white/15 text-slate-200 hover:bg-white/10 hover:border-white/25 transition-all cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.45)]"
            title="Table Settings & Camera"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4 text-slate-200" />
          </button>
        </div>
      </div>

      {/* Subtle Floating Status Whisper */}
      {announcement && (
        <div className="mt-1.5 flex justify-center">
          <div className="bg-slate-950/30 backdrop-blur-sm border border-white/10 rounded-full px-3.5 py-0.5 text-[10px] sm:text-xs font-semibold text-slate-200/90 tracking-wide shadow-sm">
            {announcement}
          </div>
        </div>
      )}

      {/* Real-Time Incoming Room Invitation Banner */}
      {incomingInvite && incomingInvite.roomCode !== activeRoomCode && (
        <div className="mt-2 flex justify-center pointer-events-auto animate-fadeIn">
          <div className="bg-slate-950/90 backdrop-blur-xl border border-amber-400/50 rounded-2xl px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.75)] flex items-center gap-3 max-w-md w-full justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                <BellRing className="w-4 h-4 animate-bounce" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  <span className="text-amber-300">{incomingInvite.fromPlayerName}</span> invited you!
                </p>
                <p className="text-[11px] text-slate-300 truncate">
                  {incomingInvite.roomName} • Code:{' '}
                  <b className="font-mono text-amber-300">{incomingInvite.roomCode}</b>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onAcceptInvite?.(incomingInvite)}
                className="px-3 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs cursor-pointer transition-all"
              >
                Join Room
              </button>
              <button
                type="button"
                onClick={() => onDismissInvite?.(incomingInvite.id)}
                className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white cursor-pointer"
                title="Decline Invite"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
