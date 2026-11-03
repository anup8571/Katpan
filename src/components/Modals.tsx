import React from 'react';
import { Card, GameStats, SeatId, Side } from '../game/types';
import { Trophy, RotateCcw, Play, Home, Crown, Scissors } from 'lucide-react';

interface RoundOverModalProps {
  winner: Side;
  playerWon: boolean;
  prevDealer: SeatId;
  prevCutter: SeatId;
  nextDealer: SeatId;
  nextCutter: SeatId;
  humanSeat: SeatId;
  matchingCard: Card;
  pointCard: Card;
  betAmount: number;
  humanDelta: number;
  totalCardsDealt: number;
  stats: GameStats;
  onNextRound: () => void;
}

export const RoundOverModal: React.FC<RoundOverModalProps> = ({
  winner,
  playerWon,
  prevDealer,
  prevCutter,
  nextDealer,
  nextCutter,
  humanSeat,
  matchingCard,
  pointCard,
  betAmount,
  humanDelta,
  totalCardsDealt,
  onNextRound,
}) => {
  const cutterWon = winner === 'player';
  const absDelta = Math.abs(humanDelta) || betAmount;

  return (
    <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-30 w-full max-w-md px-3 pointer-events-none select-none animate-fadeIn">
      <div
        className={`pointer-events-auto w-full rounded-2xl border backdrop-blur-md p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.65)] flex flex-col gap-2.5 ${
          playerWon
            ? 'bg-slate-950/45 border-emerald-400/65 shadow-[0_0_28px_rgba(52,211,153,0.25)]'
            : 'bg-slate-950/45 border-rose-400/65 shadow-[0_0_28px_rgba(244,63,94,0.25)]'
        }`}
      >
        {/* Top Row: Win/Loss Headline + Payout Badge in Fake Currency (RC) */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-md shrink-0 ${
                playerWon
                  ? 'bg-gradient-to-tr from-amber-400 to-emerald-400 text-slate-950 border border-yellow-200'
                  : 'bg-gradient-to-tr from-slate-800 to-rose-600 text-rose-100 border border-rose-300'
              }`}
            >
              {playerWon ? <Trophy className="w-5 h-5" /> : '🎲'}
            </div>
            <div className="text-left">
              <h2
                className={`text-base sm:text-lg font-black tracking-wide leading-tight ${
                  playerWon ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {cutterWon
                  ? `CUTTER (${prevCutter}) WINS BAHAR!`
                  : `UNDER (${prevDealer}) WINS ANDAR!`}
              </h2>
              <p className="text-[11px] text-slate-200/90 font-semibold">
                Matched <span className="font-black text-amber-300">{matchingCard.label}</span> on{' '}
                <span className="font-bold text-white">
                  {cutterWon ? "Bahar (Cutter's Side)" : "Andar (Under / Shuffler's Side)"}
                </span>
              </p>
            </div>
          </div>

          {/* Translucent Payout Pill (RC) */}
          <div
            className={`px-3 py-1.5 rounded-xl border font-black text-sm sm:text-base tabular-nums shrink-0 ${
              playerWon
                ? 'bg-emerald-950/55 border-emerald-400/50 text-emerald-300'
                : 'bg-rose-950/55 border-rose-400/50 text-rose-300'
            }`}
          >
            {playerWon ? `+${absDelta.toLocaleString()} RC` : `-${absDelta.toLocaleString()} RC`}
          </div>
        </div>

        {/* Anti-Clockwise Rotation Banner */}
        <div className="flex items-center justify-between gap-1.5 bg-slate-900/55 border border-amber-400/30 rounded-xl px-3 py-1.5 text-[11px] text-slate-100">
          <span className="flex items-center gap-1 font-extrabold text-amber-300">
            <Crown className="w-3.5 h-3.5" />
            <span>
              Next Under: {nextDealer} {nextDealer === humanSeat ? '(YOU)' : ''}
            </span>
          </span>
          <span className="text-slate-400">↺</span>
          <span className="flex items-center gap-1 font-extrabold text-sky-300">
            <Scissors className="w-3.5 h-3.5" />
            <span>
              Next Cutter: {nextCutter} {nextCutter === humanSeat ? '(YOU)' : ''}
            </span>
          </span>
          <span className="text-slate-500 hidden sm:inline">•</span>
          <span className="hidden sm:inline text-slate-300">
            Hukam: <b className="text-amber-300">{pointCard.rank}</b> ({totalCardsDealt} cards)
          </span>
        </div>

        {/* Addictive Next Hand CTA */}
        <button
          data-start="true"
          onClick={onNextRound}
          className="w-full py-2.5 px-5 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 border border-yellow-200 shadow-[0_3px_0_#92400e] active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2 tracking-wide"
        >
          <RotateCcw className="w-4 h-4" />
          <span>
            CONTINUE ANTI-CLOCKWISE ROUND ({nextDealer} SHUFFLES → {nextCutter} CUTS)
          </span>
        </button>
      </div>
    </div>
  );
};

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({ onResume, onRestart, onTitle }) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm select-none animate-fadeIn">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900/80 backdrop-blur-md border border-amber-500/40 p-6 shadow-2xl flex flex-col gap-4 text-center">
        <h2 className="text-2xl font-black text-amber-300 tracking-wider">GAME PAUSED</h2>
        <p className="text-xs text-slate-300 font-medium">
          Maang Patta Royal Coins 6-Seat Table is on standby.
        </p>

        <div className="flex flex-col gap-2.5 mt-2">
          <button
            onClick={onResume}
            className="w-full py-3 px-4 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-amber-300 to-yellow-400 hover:from-amber-200 hover:to-yellow-300 border border-yellow-200 shadow-[0_3px_0_#92400e] active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>RESUME (ESC / P)</span>
          </button>

          <button
            onClick={onRestart}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-200 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <RotateCcw className="w-4 h-4" />
            <span>RESTART ROUND</span>
          </button>

          <button
            onClick={onTitle}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-400 hover:text-slate-200 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Home className="w-4 h-4" />
            <span>MAIN MENU</span>
          </button>
        </div>
      </div>
    </div>
  );
};
