import React from 'react';
import { Users, User } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleScreenProps {
  onStart: () => void;
  onOpenMultiplayer?: () => void;
  onOpenProfile?: () => void;
  userDisplayName?: string | null;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  onOpenMultiplayer,
  onOpenProfile,
  userDisplayName,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex flex-col justify-between items-center p-5 sm:p-8 pointer-events-none select-none">
      {/* Top Right Quick Glass Bar for Account & Multiplayer */}
      <div className="w-full max-w-5xl flex justify-end gap-2 pointer-events-auto">
        {onOpenMultiplayer && (
          <button
            onClick={onOpenMultiplayer}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-slate-950/40 backdrop-blur-md border border-white/15 text-xs font-bold text-sky-300 hover:bg-white/10 transition-all cursor-pointer shadow-lg"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Multiplayer Lobby</span>
          </button>
        )}
        {onOpenProfile && (
          <button
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-slate-950/40 backdrop-blur-md border border-white/15 text-xs font-bold text-amber-300 hover:bg-white/10 transition-all cursor-pointer shadow-lg"
          >
            <User className="w-3.5 h-3.5" />
            <span>{userDisplayName || 'Login / Register'}</span>
          </button>
        )}
      </div>

      {/* Top Royal Crest Lockup — Sleek Transparent Glass */}
      <div className="flex flex-col items-center text-center pointer-events-auto bg-slate-950/45 backdrop-blur-xl border border-white/15 px-8 py-5 rounded-3xl shadow-[0_16px_48px_rgba(0,0,0,0.65)]">
        <svg
          className="w-14 h-14 sm:w-16 sm:h-16 mb-2"
          viewBox="0 0 100 100"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="50" cy="50" r="46" fill="#090d16" stroke="#d97706" strokeWidth="3.5" />
          <circle
            cx="50"
            cy="50"
            r="39"
            stroke="#b45309"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <path
            d="M28 62 L25 41 L40 52 L50 32 L60 52 L75 41 L72 62 Z"
            fill="#d97706"
            stroke="#fef3c7"
            strokeWidth="2"
          />
          <circle cx="50" cy="32" r="3.5" fill="#dc2626" />
          <circle cx="25" cy="41" r="2.5" fill="#fbbf24" />
          <circle cx="75" cy="41" r="2.5" fill="#fbbf24" />
          <text
            x="50"
            y="77"
            fontSize="11"
            fill="#fde68a"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontWeight="bold"
          >
            ♠ ♥ ♦ ♣
          </text>
        </svg>

        <h1
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          className="text-2xl sm:text-4xl font-black tracking-widest text-amber-300"
        >
          ROYAL KATTI
        </h1>
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.28em] text-amber-200/80 mt-1">
          Maang Patta • 3D Split-Deck Multiplayer Casino
        </p>
      </div>

      {/* Central Negative Space (Shows Live 3D Casino Table) */}
      <div className="flex-1" />

      {/* Bottom Primary Start CTA & Single Control Hint Line */}
      <div className="flex flex-col items-center gap-3 mb-2 pointer-events-auto max-w-sm w-full">
        <button
          data-start="true"
          onClick={onStart}
          className="w-full py-3.5 px-6 rounded-2xl font-black text-base sm:text-lg text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-110 border border-amber-200 shadow-[0_12px_32px_rgba(245,158,11,0.35)] active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-3 tracking-wider"
        >
          <span>ENTER ROYAL TABLE</span>
          <span className="text-[10px] font-extrabold bg-slate-950/20 px-2 py-0.5 rounded-lg text-slate-950">
            PLAY NOW
          </span>
        </button>

        <PWAInstallButton />

        <p className="text-[11px] text-slate-300/85 font-medium tracking-wide text-center">
          6-Seat Ring (A–F) · Live Multiplayer Rooms · Cloud Synced Royal Coins
        </p>
      </div>
    </div>
  );
};
