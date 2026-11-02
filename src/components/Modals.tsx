import React from 'react';
import { Card, GameStats, Side } from '../game/types';
import { Trophy, RotateCcw, Play, Home } from 'lucide-react';

interface RoundOverModalProps {
  winner: Side;
  matchingCard: Card;
  pointCard: Card;
  betAmount: number;
  totalCardsDealt: number;
  stats: GameStats;
  onNextRound: () => void;
}

export const RoundOverModal: React.FC<RoundOverModalProps> = ({
  winner,
  matchingCard,
  pointCard,
  betAmount,
  totalCardsDealt,
  stats,
  onNextRound,
}) => {
  const isPlayerWon = winner === 'player';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80 select-none animate-fadeIn">
      <div
        className={`w-full max-w-md rounded-2xl border-2 p-6 shadow-2xl flex flex-col items-center text-center gap-4 ${
          isPlayerWon
            ? 'bg-gradient-to-b from-slate-900 to-emerald-950 border-emerald-400/80 shadow-[0_0_36px_rgba(52,211,153,0.3)]'
            : 'bg-gradient-to-b from-slate-900 to-rose-950 border-rose-500/80 shadow-[0_0_36px_rgba(244,63,94,0.3)]'
        }`}
      >
        {/* Victory/Defeat Icon Badge */}
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-xl ${
            isPlayerWon
              ? 'bg-gradient-to-tr from-yellow-500 to-emerald-400 text-slate-950 border border-yellow-200'
              : 'bg-gradient-to-tr from-slate-800 to-rose-600 text-rose-200 border border-rose-400'
          }`}
        >
          {isPlayerWon ? <Trophy className="w-8 h-8" /> : '🎩'}
        </div>

        {/* Title */}
        <div>
          <h2
            className={`text-2xl md:text-3xl font-black tracking-wide ${
              isPlayerWon ? 'text-emerald-300' : 'text-rose-400'
            }`}
          >
            {isPlayerWon ? 'PLAYER WINS!' : 'DEALER WINS!'}
          </h2>
          <p className="text-xs md:text-sm text-slate-300 font-medium mt-1">
            Matching <span className="font-black text-amber-300">{matchingCard.label}</span> landed on{' '}
            <span className="font-bold text-slate-100 uppercase">{winner === 'player' ? 'Andar (Player)' : 'Bahar (Dealer)'}</span>!
          </p>
        </div>

        {/* Payout Display */}
        <div className="w-full py-3 px-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {isPlayerWon ? 'Chips Won' : 'Chips Lost'}
          </span>
          <span
            className={`text-xl font-black tabular-nums ${
              isPlayerWon ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPlayerWon ? `+₹${betAmount.toLocaleString()}` : `-₹${betAmount.toLocaleString()}`}
          </span>
        </div>

        {/* Run Metrics Tiles */}
        <div className="grid grid-cols-3 gap-2 w-full text-center">
          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Target Rank</span>
            <span className="text-sm font-black text-amber-400">{pointCard.rank}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Cards Dealt</span>
            <span className="text-sm font-black text-slate-100 tabular-nums">{totalCardsDealt}</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
            <span className="block text-[10px] font-bold text-slate-400 uppercase">Win Streak</span>
            <span className="text-sm font-black text-amber-400 tabular-nums">{stats.currentStreak}x</span>
          </div>
        </div>

        {/* Action Button */}
        <button
          data-start="true"
          onClick={onNextRound}
          className="w-full py-3.5 px-6 rounded-xl font-black text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:from-amber-200 hover:to-yellow-300 border border-yellow-200 shadow-[0_4px_0_#92400e] active:translate-y-0.5 transition-all cursor-pointer flex items-center justify-center gap-2 tracking-wide"
        >
          <RotateCcw className="w-4 h-4" />
          <span>SHUFFLE &amp; NEXT ROUND</span>
          <span className="text-[10px] bg-slate-950/20 px-1.5 py-0.5 rounded font-bold">
            SPACE / ENTER
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
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80 select-none animate-fadeIn">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-amber-500/40 p-6 shadow-2xl flex flex-col gap-4 text-center">
        <h2 className="text-2xl font-black text-amber-300 tracking-wider">GAME PAUSED</h2>
        <p className="text-xs text-slate-400 font-medium">
          Maang Patta high-roller royal table is on standby.
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
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 active:translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer transition-all"
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
