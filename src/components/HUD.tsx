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
    <div className="fixed inset-x-0 top-0 pointer-events-none z-20 flex flex-col p-1.5 sm:p-4 select-none">
      {/* Sleek, Clean Floating Top Row — Only essentials: RC Balance, Hukam card, Profile, Settings */}
      <div className="flex items-center justify-between gap-1 sm:gap-2 max-w-5xl mx-auto w-full">
        {/* Left: RC Balance Pill (+ optional room code badge if in multiplayer room) */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 shrink-0">
          <div
            data-testid="balance-display"
            className="flex items-center gap-1.5 sm:gap-2 bg-slate-950/70 backdrop-blur-md border border-emerald-400/40 rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
          >
            <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px] sm:text-sm font-black text-emerald-300 tabular-nums whitespace-nowrap tracking-wide">
              {balance.toLocaleString()} RC
            </span>
          </div>

          {activeRoomCode && (
            <div className="flex items-center gap-1 bg-slate-950/70 backdrop-blur-md border border-sky-400/40 rounded-xl sm:rounded-2xl px-2 py-1 sm:px-2.5 sm:py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.55)]">
              <span className="text-[10px] sm:text-xs font-mono font-bold text-sky-200">
                {activeRoomCode}
              </span>
              <button
                type="button"
                onClick={handleQuickCopyCode}
                title={`Copy Room Code ${activeRoomCode}`}
                className="p-0.5 sm:p-1 rounded-lg text-sky-300 hover:text-white cursor-pointer"
              >
                {copiedRoomCode ? (
                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Center: Hukam Card Pill */}
        {pointCard && (
          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 bg-slate-950/80 backdrop-blur-md border border-amber-400/60 rounded-xl sm:rounded-2xl px-2.5 py-1.5 sm:px-4 sm:py-2 shadow-[0_8px_32px_rgba(0,0,0,0.55)] animate-fadeIn shrink-0">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-200">
              Hukam:
            </span>
            <span
              className={`text-xs sm:text-base font-black ${
                isRedPoint ? 'text-rose-400' : 'text-white'
              }`}
            >
              {pointCard.label}
            </span>
          </div>
        )}

        {/* Right: Profile Button & Settings Button */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Profile Button */}
          <button
            data-testid="profile-btn"
            onClick={onOpenProfile}
            className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-xl sm:rounded-2xl bg-slate-950/70 hover:bg-slate-900/90 backdrop-blur-md border border-amber-400/40 text-amber-200 transition-all cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
            title="Access Profile & Account"
            aria-label="Profile"
          >
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            <span className="text-[11px] sm:text-sm font-bold tracking-wide max-w-[60px] xs:max-w-[80px] sm:max-w-[120px] truncate">
              {isAuthenticated && userDisplayName ? userDisplayName : 'Profile'}
            </span>
          </button>

          {/* Settings Button */}
          <button
            data-testid="settings-btn"
            onClick={onOpenSettings}
            className="p-1.5 sm:p-2.5 rounded-xl sm:rounded-2xl bg-slate-950/70 hover:bg-slate-900/90 backdrop-blur-md border border-white/20 text-slate-200 hover:text-white transition-all cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.55)] shrink-0"
            title="Settings & Audio"
            aria-label="Settings"
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>

      {/* Subtle Floating Status Whisper */}
      {announcement && (
        <div className="mt-1.5 flex justify-center px-2">
          <div className="bg-slate-950/30 backdrop-blur-sm border border-white/10 rounded-full px-3 py-0.5 text-[10px] sm:text-xs font-semibold text-slate-200/90 tracking-wide shadow-sm max-w-full truncate text-center">
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
