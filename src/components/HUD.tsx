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
  Mic,
  MicOff,
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
  onOpenVoiceChat?: () => void;
  isVoiceConnected?: boolean;
  isVoiceMuted?: boolean;
  isSomeoneSpeaking?: boolean;
  connectedVoiceCount?: number;
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
  onOpenVoiceChat,
  isVoiceConnected = false,
  isVoiceMuted = false,
  isSomeoneSpeaking = false,
  connectedVoiceCount = 0,
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
    <div className="fixed top-2 left-2 right-2 sm:top-3 sm:left-4 sm:right-4 pointer-events-none z-20 flex flex-col select-none">
      {/* Sleek, Clean Floating Top Row — Strictly responsive, zero horizontal overflow */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 max-w-5xl mx-auto w-full">
        {/* Left: RC Balance Pill (+ optional room code badge) */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div
            data-testid="balance-display"
            className="flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md border border-emerald-400/40 rounded-xl px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-md"
          >
            <Coins className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm font-black text-emerald-300 tabular-nums whitespace-nowrap tracking-wide">
              {balance.toLocaleString()} RC
            </span>
          </div>

          {activeRoomCode && (
            <div className="flex items-center gap-1 bg-slate-950/80 backdrop-blur-md border border-sky-400/40 rounded-xl px-2 py-1 shadow-md">
              <span className="text-[10px] sm:text-xs font-mono font-bold text-sky-200">
                {activeRoomCode}
              </span>
              <button
                type="button"
                onClick={handleQuickCopyCode}
                title={`Copy Room Code ${activeRoomCode}`}
                className="p-0.5 rounded text-sky-300 hover:text-white cursor-pointer"
              >
                {copiedRoomCode ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
          )}

          {/* Voice Chat Pill in Header */}
          {activeRoomCode && (
            <button
              type="button"
              onClick={onOpenVoiceChat}
              title={
                isVoiceConnected
                  ? isVoiceMuted
                    ? 'Voice Chat (Muted)'
                    : 'Voice Chat (Connected)'
                  : 'Open Voice Chat'
              }
              className={`flex items-center gap-1 backdrop-blur-md border rounded-xl px-2 py-1 shadow-md cursor-pointer transition-all ${
                isVoiceConnected
                  ? isSomeoneSpeaking
                    ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.4)]'
                    : isVoiceMuted
                    ? 'bg-rose-950/70 border-rose-400/50 text-rose-300'
                    : 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950/80 border-white/20 text-slate-300 hover:text-white'
              }`}
            >
              {isVoiceConnected ? (
                isVoiceMuted ? (
                  <MicOff className="w-3 h-3 text-rose-400" />
                ) : (
                  <Mic
                    className={`w-3 h-3 ${
                      isSomeoneSpeaking ? 'animate-pulse text-emerald-400' : 'text-emerald-300'
                    }`}
                  />
                )
              ) : (
                <Mic className="w-3 h-3 text-amber-300" />
              )}
              <span className="hidden sm:inline text-[10px] font-bold tracking-tight">
                {isVoiceConnected
                  ? isSomeoneSpeaking
                    ? 'Speaking'
                    : isVoiceMuted
                    ? 'Muted'
                    : 'Voice'
                  : 'Voice'}
              </span>
              {connectedVoiceCount > 0 && (
                <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/30 text-emerald-300 text-[9px] font-mono font-bold flex items-center justify-center">
                  {connectedVoiceCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Center: Hukam Card Pill */}
        {pointCard && (
          <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 bg-slate-950/85 backdrop-blur-md border border-amber-400/60 rounded-xl px-2.5 py-1 sm:px-3 sm:py-1.5 shadow-md shrink-0">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-amber-200 shrink-0">
              Hukam:
            </span>
            <span
              className={`text-xs sm:text-sm font-black ${
                isRedPoint ? 'text-rose-400' : 'text-white'
              }`}
            >
              {pointCard.label}
            </span>
          </div>
        )}

        {/* Right: Profile Button & Settings Button — Guaranteed inside screen boundaries */}
        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0">
          {/* Profile Button - compact icon on mobile, name on sm+ screens */}
          <button
            data-testid="profile-btn"
            onClick={onOpenProfile}
            className="flex items-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-slate-950/80 hover:bg-slate-900 backdrop-blur-md border border-amber-400/40 text-amber-200 transition-all cursor-pointer shadow-md shrink-0"
            title="Access Profile & Account"
            aria-label="Profile"
          >
            <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 shrink-0" />
            <span className="hidden sm:inline text-xs font-bold tracking-wide max-w-[80px] truncate">
              {isAuthenticated && userDisplayName ? userDisplayName : 'Profile'}
            </span>
          </button>

          {/* Settings Button - Solidly anchored, high-contrast, always on-screen */}
          <button
            data-testid="settings-btn"
            onClick={onOpenSettings}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-950/85 hover:bg-slate-900 backdrop-blur-md border border-amber-400/60 hover:border-amber-400 text-amber-300 hover:text-white transition-all cursor-pointer shadow-md shrink-0"
            title="Settings & Audio"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4 text-amber-300" />
          </button>
        </div>
      </div>


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
