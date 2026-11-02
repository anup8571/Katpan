import React from 'react';
import { Card, GameStats } from '../game/types';
import { Volume2, VolumeX, Pause, Crown } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HUDProps {
  balance: number;
  currentBet: number;
  stats: GameStats;
  pointCard: Card | null;
  playerCards: Card[];
  dealerCards: Card[];
  turnIndex: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  announcement: string;
}

export const HUD: React.FC<HUDProps> = ({
  balance,
  currentBet,
  stats,
  pointCard,
  playerCards,
  dealerCards,
  turnIndex,
  isMuted,
  onToggleMute,
  onPause,
  announcement,
}) => {
  const isPlayerTurn = turnIndex % 2 === 0;

  return (
    <div className="fixed inset-x-0 top-0 pointer-events-none z-20 flex flex-col p-2 sm:p-4 select-none">
      <div className="flex flex-col gap-1.5 max-w-4xl mx-auto w-full">
        {/* Compact Luxury Casino Top Bar */}
        <header
          style={{ backgroundColor: 'rgba(9, 13, 22, 0.94)' }}
          className="pointer-events-auto flex items-center justify-between border border-amber-500/40 rounded-xl px-2.5 py-1.5 sm:px-4 sm:py-2 shadow-[0_8px_24px_rgba(0,0,0,0.75)] text-slate-100"
        >
          {/* Brand Crest */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 bg-amber-500/15 border border-amber-500/40 rounded-lg text-amber-400 shrink-0">
              <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
            <div className="truncate">
              <h2 className="text-[11px] sm:text-sm font-black tracking-wider text-amber-300 leading-tight truncate">
                ROYAL KATTI
              </h2>
              <p className="text-[9px] sm:text-[10px] text-amber-200/60 font-semibold uppercase tracking-widest leading-tight truncate">
                Maang Patta
              </p>
            </div>
          </div>

          {/* Center Target Point Card Indicator (Visible on both Mobile & Desktop) */}
          {pointCard ? (
            <div className="flex items-center gap-1.5 bg-amber-950/80 border border-amber-400/60 rounded-lg px-2 py-0.5 sm:px-3 sm:py-1 shadow-[0_0_12px_rgba(251,191,36,0.2)]">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-amber-200/80">
                Hukam:
              </span>
              <span className="text-xs sm:text-sm font-black text-amber-300 tabular-nums">
                {pointCard.label}
              </span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                52-Card Split Shoe
              </span>
            </div>
          )}

          {/* Wallet, Bet & Utility Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {stats.currentStreak > 1 && (
              <div className="hidden md:flex items-center gap-1 bg-amber-500/15 border border-amber-500/40 rounded-lg px-2 py-1">
                <span className="text-[10px] font-black text-amber-300 tabular-nums">
                  {stats.currentStreak}x STREAK
                </span>
              </div>
            )}

            {/* Bet Readout */}
            <div className="bg-slate-950 border border-amber-500/30 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 text-right">
              <span className="block text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                WAGER
              </span>
              <span className="text-[11px] sm:text-xs font-black text-amber-300 tabular-nums">
                ₹{currentBet}
              </span>
            </div>

            {/* Balance Readout */}
            <div className="bg-slate-950 border border-amber-400/60 rounded-lg px-2 py-0.5 sm:px-3 sm:py-1 text-right">
              <span className="block text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                BALANCE
              </span>
              <span className="text-[11px] sm:text-xs font-black text-emerald-400 tabular-nums">
                ₹{balance.toLocaleString()}
              </span>
            </div>

            <PWAInstallButton compact />

            {/* Audio Toggle */}
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              title={isMuted ? 'Unmute Sound (M)' : 'Mute Sound (M)'}
              aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
              className="p-1.5 sm:p-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-300 border border-slate-700 rounded-lg cursor-pointer transition-all"
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />
              )}
            </button>

            {/* Pause Button */}
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              title="Pause Game (Esc or P)"
              aria-label="Pause Game"
              className="p-1.5 sm:p-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-slate-300 border border-slate-700 rounded-lg cursor-pointer transition-all"
            >
              <Pause className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </header>

        {/* Slim Dealer Announcement & Live Andar/Bahar Counters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5">
          {/* Dealer Ribbon */}
          <div
            style={{ backgroundColor: 'rgba(9, 13, 22, 0.9)' }}
            className="pointer-events-auto flex-1 border border-amber-500/30 rounded-lg px-3 py-1 text-center sm:text-left shadow-md"
          >
            <p
              className="text-[11px] sm:text-xs font-semibold text-slate-200 truncate"
              dangerouslySetInnerHTML={{ __html: announcement }}
            />
          </div>

          {/* Live Andar / Bahar Compact Status Pills (Never overlapped by bottom dock!) */}
          <div className="grid grid-cols-2 sm:flex items-center gap-1.5 shrink-0 pointer-events-auto">
            <div
              style={{
                backgroundColor: isPlayerTurn
                  ? 'rgba(12, 45, 68, 0.94)'
                  : 'rgba(9, 13, 22, 0.88)',
              }}
              className={`flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg border text-[10px] sm:text-[11px] transition-all ${
                isPlayerTurn
                  ? 'border-sky-400/80 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.25)]'
                  : 'border-slate-700/80 text-slate-400'
              }`}
            >
              <span className="font-black tracking-wide text-sky-300">ANDAR</span>
              <span className="font-mono text-slate-300 truncate max-w-[68px]">
                {playerCards.length > 0
                  ? playerCards
                      .slice(0, 3)
                      .map((c) => c.label)
                      .join(' ')
                  : '—'}
              </span>
              <span className="font-black bg-slate-950/90 text-sky-300 px-1.5 py-0.2 rounded border border-sky-500/30 tabular-nums">
                {playerCards.length}
              </span>
            </div>

            <div
              style={{
                backgroundColor: !isPlayerTurn
                  ? 'rgba(68, 14, 32, 0.94)'
                  : 'rgba(9, 13, 22, 0.88)',
              }}
              className={`flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg border text-[10px] sm:text-[11px] transition-all ${
                !isPlayerTurn
                  ? 'border-rose-400/80 text-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.25)]'
                  : 'border-slate-700/80 text-slate-400'
              }`}
            >
              <span className="font-black tracking-wide text-rose-300">BAHAR</span>
              <span className="font-mono text-slate-300 truncate max-w-[68px]">
                {dealerCards.length > 0
                  ? dealerCards
                      .slice(0, 3)
                      .map((c) => c.label)
                      .join(' ')
                  : '—'}
              </span>
              <span className="font-black bg-slate-950/90 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/30 tabular-nums">
                {dealerCards.length}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
