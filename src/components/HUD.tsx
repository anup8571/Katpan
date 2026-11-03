import React from 'react';
import { Card, GameStats, SeatId, SeatInfo } from '../game/types';
import { Volume2, VolumeX, Pause, Crown, Scissors, Coins } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface HUDProps {
  balance: number;
  currentBet: number;
  stats: GameStats;
  pointCard: Card | null;
  dealerSeat: SeatId;
  cutterSeat: SeatId;
  humanSeat: SeatId;
  activeActorSeat: SeatId | null;
  seats: SeatInfo[];
  onSelectHumanSeat: (seatId: SeatId) => void;
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
  dealerSeat,
  cutterSeat,
  humanSeat,
  activeActorSeat,
  seats,
  onSelectHumanSeat,
  isMuted,
  onToggleMute,
  onPause,
}) => {
  const dealerIsYou = dealerSeat === humanSeat;
  const cutterIsYou = cutterSeat === humanSeat;
  const totalPool = seats.reduce((sum, s) => sum + s.balance, 0);

  return (
    <div className="fixed inset-x-0 top-0 pointer-events-none z-20 flex flex-col p-2 sm:p-3 select-none">
      <div className="flex flex-col gap-1.5 max-w-4xl mx-auto w-full">
        {/* Compact Luxury Casino Top Bar */}
        <header
          style={{ backgroundColor: 'rgba(9, 13, 22, 0.88)' }}
          className="pointer-events-auto backdrop-blur-md flex items-center justify-between border border-amber-500/40 rounded-xl px-2.5 py-1.5 sm:px-3.5 sm:py-2 shadow-[0_8px_24px_rgba(0,0,0,0.7)] text-slate-100"
        >
          {/* Brand Crest & Active Dealer/Cutter Readout */}
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`p-1.5 rounded-lg border shrink-0 ${
                dealerIsYou
                  ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
              }`}
            >
              <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[11px] sm:text-sm font-black tracking-wider text-amber-300 leading-tight whitespace-nowrap">
                  ROYAL KATTI
                </h2>
                <span className="hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-500/40 uppercase tracking-wider shrink-0">
                  👑 Under: {dealerSeat} {dealerIsYou ? '(You)' : ''}
                </span>
                <span className="hidden sm:inline-block text-[9px] font-black px-1.5 py-0.5 rounded bg-sky-950/90 text-sky-300 border border-sky-400/40 uppercase tracking-wider shrink-0">
                  ✂️ Bahar: {cutterSeat} {cutterIsYou ? '(You)' : ''}
                </span>
                <span className="hidden md:inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider shrink-0">
                  <Coins className="w-2.5 h-2.5" />
                  Pool: {totalPool.toLocaleString()} RC
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold tracking-wider leading-tight text-slate-200 truncate mt-0.5">
                <span className="text-amber-300">👑 {dealerSeat} Shuffles (Under)</span>
                <span className="mx-1 text-slate-500">•</span>
                <span className="text-sky-300">✂️ {cutterSeat} Cuts (Bahar)</span>
                {pointCard && (
                  <span className="text-amber-300 font-black ml-1.5">
                    • Hukam: {pointCard.label}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Wallet, Bet & Utility Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {stats.currentStreak > 1 && (
              <div className="hidden lg:flex items-center gap-1 bg-amber-500/15 border border-amber-500/40 rounded-lg px-2 py-1">
                <span className="text-[10px] font-black text-amber-300 tabular-nums">
                  {stats.currentStreak}x STREAK
                </span>
              </div>
            )}

            {/* Bet Readout (Fake Currency: RC) */}
            <div className="bg-slate-950/90 border border-amber-500/30 rounded-lg px-2 py-0.5 sm:px-2.5 sm:py-1 text-right">
              <span className="block text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                YOUR WAGER
              </span>
              <span className="text-[11px] sm:text-xs font-black text-amber-300 tabular-nums">
                {currentBet} RC
              </span>
            </div>

            {/* Balance Readout (Fake Currency: RC) */}
            <div className="bg-slate-950/90 border border-amber-400/60 rounded-lg px-2 py-0.5 sm:px-3 sm:py-1 text-right">
              <span className="block text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-none">
                ROYAL COINS
              </span>
              <span className="text-[11px] sm:text-xs font-black text-emerald-400 tabular-nums">
                {balance.toLocaleString()} RC
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

        {/* Compact Anti-Clockwise 6-Player Ring Strip (A -> B -> C -> D -> E -> F) */}
        <div className="pointer-events-auto grid grid-cols-6 gap-1 bg-slate-950/65 backdrop-blur-md border border-slate-800/80 rounded-xl p-1 shadow-lg">
          {seats.map((s) => {
            const isDealer = s.id === dealerSeat;
            const isCutter = s.id === cutterSeat;
            const isActiveTurn = s.id === activeActorSeat;
            const betBadge =
              !isDealer && s.betSide
                ? `${s.betSide === 'dealer' ? 'ANDAR' : 'BAHAR'} ${s.betAmount} RC`
                : isDealer
                ? 'UNDER • BANK'
                : isCutter
                ? 'BAHAR • CUT'
                : `${s.balance} RC`;

            return (
              <button
                key={s.id}
                onClick={() => onSelectHumanSeat(s.id)}
                title={`Sit at Seat ${s.id} (${s.balance} RC)`}
                className={`flex flex-col items-center justify-center rounded-lg px-1 py-1 border text-center transition-all cursor-pointer ${
                  isActiveTurn
                    ? 'bg-amber-500/25 border-amber-300 ring-1 ring-amber-300'
                    : isDealer
                    ? 'bg-amber-950/75 border-amber-500/60'
                    : isCutter
                    ? 'bg-sky-950/75 border-sky-400/60'
                    : s.isHuman
                    ? 'bg-emerald-950/70 border-emerald-400/50'
                    : 'bg-slate-900/65 border-slate-800'
                }`}
              >
                <div className="flex items-center gap-0.5 text-[9px] sm:text-[10px] font-black leading-none">
                  <span
                    className={
                      s.isHuman
                        ? 'text-emerald-300'
                        : isDealer
                        ? 'text-amber-300'
                        : isCutter
                        ? 'text-sky-300'
                        : 'text-slate-200'
                    }
                  >
                    {s.id}•{s.isHuman ? 'YOU' : s.shortName}
                  </span>
                  {isDealer && <Crown className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                  {isCutter && <Scissors className="w-2.5 h-2.5 text-sky-300 shrink-0" />}
                </div>
                <span
                  className={`text-[8px] sm:text-[9px] font-extrabold uppercase tracking-tighter leading-tight mt-0.5 truncate max-w-full ${
                    s.betSide === 'dealer'
                      ? 'text-rose-300'
                      : s.betSide === 'player'
                      ? 'text-sky-300'
                      : isDealer
                      ? 'text-amber-300'
                      : isCutter
                      ? 'text-sky-200'
                      : 'text-slate-300'
                  }`}
                >
                  {betBadge}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
