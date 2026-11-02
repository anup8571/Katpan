import React from 'react';
import { GamePhase, SeatId, Side } from '../game/types';
import { Shuffle, Play, FastForward, Scissors, Crown, Sparkles } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface ControlDockProps {
  phase: GamePhase;
  dealerSeat: SeatId;
  cutterSeat: SeatId;
  humanSeat: SeatId;
  activeActorSeat: SeatId | null;
  statusText: string;
  onPlayerShuffle: () => void;
  currentBet: number;
  onSelectBet: (bet: number) => void;
  cutIndex: number;
  onChangeCutIndex: (cut: number) => void;
  onConfirmCut: () => void;
  onPlaceHumanBet: (side: Side) => void;
  onDealOne: () => void;
  onAutoDeal: () => void;
  isAutoDealing: boolean;
  botFastMode: boolean;
  onToggleBotFastMode: () => void;
  isBusy: boolean;
}

const CHIP_DENOMS = [
  { value: 50, bg: '#1e3a8a', border: '#60a5fa', text: '#ffffff' },
  { value: 100, bg: '#7f1d1d', border: '#f87171', text: '#ffffff' },
  { value: 250, bg: '#064e3b', border: '#34d399', text: '#ffffff' },
  { value: 500, bg: '#4c1d95', border: '#c084fc', text: '#ffffff' },
  { value: 1000, bg: '#78350f', border: '#fbbf24', text: '#fef3c7' },
];

export const ControlDock: React.FC<ControlDockProps> = ({
  phase,
  dealerSeat,
  cutterSeat,
  humanSeat,
  activeActorSeat,
  statusText,
  onPlayerShuffle,
  currentBet,
  onSelectBet,
  cutIndex,
  onChangeCutIndex,
  onConfirmCut,
  onPlaceHumanBet,
  onDealOne,
  onAutoDeal,
  isAutoDealing,
  botFastMode,
  onToggleBotFastMode,
  isBusy,
}) => {
  const isHumanDealer = dealerSeat === humanSeat;
  const isHumanCutter = cutterSeat === humanSeat;
  const isHumanBetTurn = phase === 'betting' && activeActorSeat === humanSeat;

  return (
    <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md px-3 pointer-events-none select-none">
      <div className="pointer-events-auto bg-slate-950/55 backdrop-blur-md border border-amber-400/40 rounded-2xl p-2.5 shadow-[0_10px_32px_rgba(0,0,0,0.65)] flex flex-col gap-2">
        {/* Live Anti-Clockwise Action Status Strip */}
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-bold text-amber-100 truncate">{statusText}</span>
          <button
            onClick={onToggleBotFastMode}
            title="Toggle 2x Bot Speed"
            className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border transition-all cursor-pointer shrink-0 ${
              botFastMode
                ? 'bg-amber-400 text-slate-950 border-yellow-200'
                : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            {botFastMode ? '⚡ 2x Speed' : '1x Speed'}
          </button>
        </div>

        {/* STAGE 1: SHUFFLING (When YOU are the Dealer) */}
        {phase === 'shuffling' && isHumanDealer && (
          <button
            onClick={onPlayerShuffle}
            disabled={isBusy}
            className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 border border-yellow-200 shadow-[0_3px_0_#92400e] active:translate-y-0.5 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Shuffle className="w-4 h-4" />
            <span>SHUFFLE &amp; PASS TO CUTTER ({cutterSeat})</span>
          </button>
        )}

        {/* STAGE 2: CUTTING THE DECK FIRST (When YOU are the Cutter) */}
        {phase === 'cutting' && isHumanCutter && (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-900/75 border border-slate-700/70 rounded-xl px-2.5 py-1.5 flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] font-extrabold text-sky-200">
                <span className="flex items-center gap-1">
                  <Scissors className="w-3 h-3 text-sky-400" />
                  <span>You Are Cutter ({cutterSeat}) • Cut Deck</span>
                </span>
                <span className="font-mono text-amber-400 tabular-nums">
                  {cutIndex} / {52 - cutIndex}
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={44}
                value={cutIndex}
                disabled={isBusy}
                aria-label="Cut Position"
                onChange={(e) => {
                  soundEngine.playCardFlick(1.2);
                  onChangeCutIndex(parseInt(e.target.value, 10));
                }}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            <button
              onClick={onConfirmCut}
              disabled={isBusy}
              className="py-3 px-4 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-[0_3px_0_#0369a1] active:translate-y-0.5 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Scissors className="w-4 h-4" />
              <span>CUT DECK</span>
            </button>
          </div>
        )}

        {/* STAGE 3: ANTI-CLOCKWISE BETTING (When it is YOUR turn to Bet on Andar/Dealer or Bahar/Cutter) */}
        {isHumanBetTurn && (
          <div className="flex flex-col gap-2">
            {/* Chip Selector Row */}
            <div className="flex items-center justify-between gap-2 bg-slate-900/65 border border-slate-800 rounded-xl px-2.5 py-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-200">
                Select Wager:
              </span>
              <div className="flex items-center gap-1.5">
                {CHIP_DENOMS.map(({ value, bg, border, text }) => {
                  const isActive = currentBet === value;
                  return (
                    <button
                      key={value}
                      onClick={() => {
                        soundEngine.playChipClick();
                        onSelectBet(value);
                      }}
                      style={{
                        backgroundColor: bg,
                        borderColor: isActive ? '#fde047' : border,
                        color: text,
                      }}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-dashed font-black text-[10px] flex items-center justify-center transition-all cursor-pointer shadow-md tabular-nums ${
                        isActive
                          ? 'scale-110 -translate-y-0.5 ring-2 ring-amber-300'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      {value >= 1000 ? `${value / 1000}k` : value}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Choose Side: Under/Dealer's Side (Andar) OR Bahar/Cutter's Side */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onPlaceHumanBet('dealer')}
                className="py-2.5 px-3 rounded-xl font-black text-xs text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:brightness-110 border border-rose-300 shadow-[0_3px_0_#881337] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all"
              >
                <span className="flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>BET ANDAR (₹{currentBet})</span>
                </span>
                <span className="text-[9px] font-bold text-rose-100/90 mt-0.5">
                  Under • Dealer ({dealerSeat}) Side
                </span>
              </button>

              <button
                onClick={() => onPlaceHumanBet('player')}
                className="py-2.5 px-3 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-[0_3px_0_#0369a1] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all"
              >
                <span className="flex items-center gap-1">
                  <Scissors className="w-3.5 h-3.5" />
                  <span>BET BAHAR (₹{currentBet})</span>
                </span>
                <span className="text-[9px] font-extrabold text-slate-900/85 mt-0.5">
                  Bahar • Cutter ({cutterSeat}) Side
                </span>
              </button>
            </div>
          </div>
        )}

        {/* STAGE 4A: DEALING CARDS WHEN YOU ARE THE DEALER */}
        {phase === 'dealing' && isHumanDealer && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onDealOne}
              disabled={isBusy || isAutoDealing}
              className="py-3 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 active:translate-y-0.5 border border-yellow-200 shadow-[0_3px_0_#92400e] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>DEAL CARD</span>
            </button>

            <button
              onClick={onAutoDeal}
              disabled={isBusy && !isAutoDealing}
              className={`py-3 px-4 rounded-xl font-black text-xs sm:text-sm hover:brightness-110 border shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isAutoDealing
                  ? 'bg-rose-600/90 text-white border-rose-300 animate-pulse'
                  : 'bg-emerald-500/90 text-slate-950 border-emerald-200 shadow-[0_3px_0_#065f46] active:translate-y-0.5'
              }`}
            >
              <FastForward className="w-4 h-4" />
              <span>{isAutoDealing ? 'STOP AUTO' : 'AUTO DEAL'}</span>
            </button>
          </div>
        )}

        {/* STAGE 4B: BOT AUTO-PLAYING INDICATOR (When Bot is Shuffling, Cutting, Betting, or Auto-Dealing) */}
        {((phase === 'shuffling' && !isHumanDealer) ||
          (phase === 'cutting' && !isHumanCutter) ||
          (phase === 'betting' && !isHumanBetTurn) ||
          (phase === 'dealing' && !isHumanDealer)) && (
          <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-slate-900/60 border border-amber-400/25 text-xs font-extrabold text-amber-200">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
            <span>
              {phase === 'dealing'
                ? `🤖 Dealer ${dealerSeat} is auto-dealing cards (Cutter ${cutterSeat} watches)...`
                : statusText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
