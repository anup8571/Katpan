import React from 'react';
import { GamePhase, SeatId, Side } from '../game/types';
import {
  Shuffle,
  Play,
  FastForward,
  Scissors,
  Crown,
  Sparkles,
  Dices,
  Scale,
  Minus,
  Plus,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { soundEngine } from '../game/audio';
import { haptics } from '../game/haptics';

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
  onRandomizeBet: () => void;
  cutIndex: number;
  onChangeCutIndex: (cut: number) => void;
  onConfirmCut: () => void;
  onPlaceHumanBet: (side: Side) => void;
  onSkipHumanBet?: () => void;
  onDealOne: () => void;
  onAutoDeal: () => void;
  isAutoDealing: boolean;
  botFastMode: boolean;
  onToggleBotFastMode: () => void;
  isBusy: boolean;
  redTotal?: number;
  blueTotal?: number;
  isBalanced?: boolean;
  onQuickBalance?: () => void;
  onAdjustBet?: (side: 'dealer' | 'player', delta: number) => void;
}

const CHIP_DENOMS = [
  { value: 50, bg: '#1e3a8a', border: '#60a5fa', text: '#ffffff' },
  { value: 100, bg: '#7f1d1d', border: '#f87171', text: '#ffffff' },
  { value: 250, bg: '#064e3b', border: '#34d399', text: '#ffffff' },
  { value: 500, bg: '#4c1d95', border: '#c084fc', text: '#ffffff' },
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
  onRandomizeBet,
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
  redTotal = 0,
  blueTotal = 0,
  isBalanced = false,
  onSkipHumanBet,
  onQuickBalance,
  onAdjustBet,
}) => {
  const isHumanDealer = dealerSeat === humanSeat;
  const isHumanCutter = cutterSeat === humanSeat;
  const isHumanBetTurn = phase === 'betting' && activeActorSeat === humanSeat;
  const showPoolTracker =
    phase === 'betting' ||
    phase === 'balancing' ||
    phase === 'dealing' ||
    redTotal > 0 ||
    blueTotal > 0;

  return (
    <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-2 sm:px-3 pointer-events-none select-none">
      <div className="pointer-events-auto bg-slate-950/80 backdrop-blur-xl border border-amber-400/40 rounded-2xl p-2.5 sm:p-3 shadow-[0_12px_40px_rgba(0,0,0,0.8)] flex flex-col gap-2 sm:gap-2.5 overflow-hidden">
        {/* Live Step Status Strip */}
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-100 truncate min-w-0">
            {((phase === 'shuffling' && !isHumanDealer) ||
              (phase === 'cutting' && !isHumanCutter) ||
              (phase === 'betting' && !isHumanBetTurn) ||
              (phase === 'balancing' && !isBalanced) ||
              (phase === 'dealing' && !isHumanDealer)) && (
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
            )}
            <span className="truncate">{statusText}</span>
          </span>
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

        {/* PROMINENT TWO-SIDED POOL TRACKER: RED (SHUFFLER) VS BLUE (CUTTER) */}
        {showPoolTracker && (
          <div className="bg-slate-900/90 border border-white/10 rounded-xl p-2 sm:p-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-1 sm:gap-2 text-xs font-black min-w-0">
              {/* Red Side (Shuffler) */}
              <div className="flex-1 min-w-0 flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/50 text-rose-300">
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                <span className="text-[10px] sm:text-[11px] truncate whitespace-nowrap">
                  RED<span className="hidden sm:inline"> (SHUFFLER)</span>:
                </span>
                <span className="font-mono text-white text-[11px] sm:text-sm font-extrabold whitespace-nowrap shrink-0">
                  {redTotal} RC
                </span>
              </div>

              {/* Status Pill */}
              <div
                className={`shrink-0 px-2 sm:px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-black flex items-center gap-1 border whitespace-nowrap ${
                  isBalanced
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300'
                    : 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                }`}
              >
                {isBalanced ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span>
                      <span className="hidden sm:inline">BALANCED </span>({redTotal} RC)
                    </span>
                  </>
                ) : (
                  <>
                    <Scale className="w-3 h-3 text-amber-400 shrink-0" />
                    <span>
                      DIFF: {Math.abs((Number(redTotal) || 0) - (Number(blueTotal) || 0))} RC
                    </span>
                  </>
                )}
              </div>

              {/* Blue Side (Cutter) */}
              <div className="flex-1 min-w-0 flex items-center justify-center sm:justify-start gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/50 text-sky-300">
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-sky-500 animate-pulse shrink-0" />
                <span className="text-[10px] sm:text-[11px] truncate whitespace-nowrap">
                  BLUE<span className="hidden sm:inline"> (CUTTER)</span>:
                </span>
                <span className="font-mono text-white text-[11px] sm:text-sm font-extrabold whitespace-nowrap shrink-0">
                  {blueTotal} RC
                </span>
              </div>
            </div>

            {/* Visual Balance Ratio Bar */}
            <div className="w-full bg-slate-950 rounded-full h-1.5 flex overflow-hidden border border-white/10">
              <div
                className="bg-rose-500 transition-all duration-300"
                style={{
                  width: `${redTotal + blueTotal > 0 ? (redTotal / (redTotal + blueTotal)) * 100 : 50}%`,
                }}
              />
              <div
                className="bg-sky-500 transition-all duration-300"
                style={{
                  width: `${redTotal + blueTotal > 0 ? (blueTotal / (redTotal + blueTotal)) * 100 : 50}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* STEP 1: SHUFFLING (When YOU are the Shuffler / Under) */}
        {phase === 'shuffling' && isHumanDealer && (
          <button
            onClick={() => {
              haptics.hapticCardFlick();
              onPlayerShuffle();
            }}
            disabled={isBusy}
            className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 border border-yellow-200 shadow-[0_3px_0_#92400e] active:translate-y-0.5 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <Shuffle className="w-4 h-4" />
            <span>SHUFFLE &amp; PASS TO CUTTER ({cutterSeat})</span>
          </button>
        )}

        {/* STEP 2: CUTTING (When YOU are the Cutter) */}
        {phase === 'cutting' && isHumanCutter && (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-900/75 border border-slate-700/70 rounded-xl px-2.5 py-1.5 flex flex-col gap-1">
              <div className="flex justify-between items-center text-[10px] font-extrabold text-sky-200">
                <span className="flex items-center gap-1">
                  <Scissors className="w-3 h-3 text-sky-400" />
                  <span>You Are Cutter ({cutterSeat}) • Cut Deck</span>
                </span>
                <span className="font-mono text-amber-400 tabular-nums">
                  {typeof cutIndex === 'number' && !isNaN(cutIndex) ? cutIndex : 26} /{' '}
                  {52 - (typeof cutIndex === 'number' && !isNaN(cutIndex) ? cutIndex : 26)}
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={44}
                value={typeof cutIndex === 'number' && !isNaN(cutIndex) ? cutIndex : 26}
                disabled={isBusy}
                aria-label="Cut Position"
                onChange={(e) => {
                  soundEngine.playCardFlick(1.2);
                  haptics.hapticCardFlick();
                  const parsed = parseInt(e.target.value, 10);
                  if (!isNaN(parsed)) {
                    onChangeCutIndex(parsed);
                  }
                }}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            <button
              onClick={() => {
                haptics.hapticCut();
                onConfirmCut();
              }}
              disabled={isBusy}
              className="py-3 px-4 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-[0_3px_0_#0369a1] active:translate-y-0.5 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Scissors className="w-4 h-4" />
              <span>CUT DECK</span>
            </button>
          </div>
        )}

        {/* STEP 3..6: BETTING TURN CONTROLS */}
        {isHumanBetTurn && (
          <div className="flex flex-col gap-2">
            {/* Chip Selector Row + Random Bet Button */}
            <div className="flex items-center justify-between gap-1 sm:gap-2 bg-slate-900/65 border border-slate-800 rounded-xl px-2 sm:px-2.5 py-1.5 min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-200 shrink-0">
                Wager (RC):
              </span>
              <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                {CHIP_DENOMS.map(({ value, bg, border, text }) => {
                  const isActive = currentBet === value;
                  return (
                    <button
                      key={value}
                      onClick={() => {
                        soundEngine.playChipClick();
                        haptics.hapticChip();
                        onSelectBet(value);
                      }}
                      style={{
                        backgroundColor: bg,
                        borderColor: isActive ? '#fde047' : border,
                        color: text,
                      }}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-dashed font-black text-[10px] flex items-center justify-center transition-all cursor-pointer shadow-md tabular-nums shrink-0 ${
                        isActive
                          ? 'scale-110 -translate-y-0.5 ring-2 ring-amber-300'
                          : 'opacity-80 hover:opacity-100'
                      }`}
                    >
                      {value}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    soundEngine.playChipClick();
                    haptics.hapticTap();
                    onRandomizeBet();
                  }}
                  title="Pick Random Wager"
                  className="px-1.5 sm:px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-[10px] font-black text-amber-200 flex items-center gap-1 cursor-pointer transition-all shrink-0"
                >
                  <Dices className="w-3 h-3 text-amber-300 shrink-0" />
                  <span>Random</span>
                </button>
              </div>
            </div>

            {/* CUTTER BETS FIRST: Locked to Blue / Cutter Side */}
            {isHumanCutter ? (
              <button
                onClick={() => {
                  haptics.hapticChip();
                  onPlaceHumanBet('player');
                }}
                className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-[0_3px_0_#0369a1] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all"
              >
                <span className="flex items-center gap-1.5">
                  <Scissors className="w-4 h-4" />
                  <span>PLACE CUTTER BET ON BLUE ({currentBet} RC)</span>
                </span>
                <span className="text-[9px] font-extrabold text-slate-900/85 mt-0.5">
                  Cutter bets first on Blue side
                </span>
              </button>
            ) : isHumanDealer ? (
              /* SHUFFLER BETS SECOND: Locked to Red / Shuffler Side */
              <button
                onClick={() => {
                  haptics.hapticChip();
                  onPlaceHumanBet('dealer');
                }}
                className="w-full py-2.5 px-4 rounded-xl font-black text-xs sm:text-sm text-white bg-gradient-to-r from-rose-600 via-rose-500 to-pink-600 hover:brightness-110 border border-rose-300 shadow-[0_3px_0_#881337] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all"
              >
                <span className="flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-300" />
                  <span>PLACE SHUFFLER BET ON RED ({currentBet} RC)</span>
                </span>
                <span className="text-[9px] font-extrabold text-rose-100/90 mt-0.5">
                  Shuffler bets second on Red side
                </span>
              </button>
            ) : (
              /* OTHER TABLE PLAYERS: Bet Red, Bet Blue, or Skip Bet (stays Yellow) */
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                <button
                  onClick={() => {
                    haptics.hapticChip();
                    onPlaceHumanBet('dealer');
                  }}
                  className="py-2 px-1 sm:px-2 rounded-xl font-black text-xs text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:brightness-110 border border-rose-300 shadow-[0_3px_0_#881337] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all min-w-0"
                >
                  <span className="flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-300 shrink-0" />
                    <span className="truncate">BET RED</span>
                  </span>
                  <span className="text-[10px] font-bold text-rose-100/90 mt-0.5 truncate">
                    {currentBet} RC
                  </span>
                </button>

                <button
                  onClick={() => {
                    haptics.hapticChip();
                    onPlaceHumanBet('player');
                  }}
                  className="py-2 px-1 sm:px-2 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-[0_3px_0_#0369a1] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all min-w-0"
                >
                  <span className="flex items-center gap-1">
                    <Scissors className="w-3 h-3 shrink-0" />
                    <span className="truncate">BET BLUE</span>
                  </span>
                  <span className="text-[10px] font-extrabold text-slate-900/85 mt-0.5 truncate">
                    {currentBet} RC
                  </span>
                </button>

                <button
                  onClick={() => {
                    haptics.hapticTap();
                    onSkipHumanBet?.();
                  }}
                  className="py-2 px-1 sm:px-2 rounded-xl font-black text-xs text-yellow-300 bg-slate-900 hover:bg-slate-800 border border-yellow-400/50 shadow-[0_3px_0_#713f12] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all min-w-0"
                  title="Skip this round — indicator remains yellow"
                >
                  <span className="flex items-center gap-1">
                    <Ban className="w-3 h-3 text-yellow-400 shrink-0" />
                    <span className="truncate">SKIP BET</span>
                  </span>
                  <span className="text-[9px] font-bold text-yellow-200/70 mt-0.5 truncate">
                    Stay Yellow
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 7: POOL BALANCING CONTROLS */}
        {phase === 'balancing' && (
          <div className="flex flex-col gap-2">
            {!isBalanced ? (
              <div className="bg-amber-500/10 border border-amber-400/30 rounded-xl p-2.5 flex flex-col gap-2">
                <div className="flex items-center justify-center gap-1.5 text-center text-xs font-bold text-amber-200">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>Bots are negotiating &amp; equalising bets to match pools...</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Red Adjustments */}
                  <div className="flex items-center justify-between bg-slate-950/60 border border-rose-500/40 rounded-lg p-1.5">
                    <span className="text-[11px] font-bold text-rose-300">Red:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          haptics.hapticChip();
                          onAdjustBet?.('dealer', -50);
                        }}
                        className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-black cursor-pointer"
                        title="Decrease Red by 50 RC"
                      >
                        -50
                      </button>
                      <button
                        onClick={() => {
                          haptics.hapticChip();
                          onAdjustBet?.('dealer', +50);
                        }}
                        className="px-2 py-0.5 rounded bg-rose-500/30 hover:bg-rose-500/40 text-rose-200 text-xs font-black cursor-pointer"
                        title="Increase Red by 50 RC"
                      >
                        +50
                      </button>
                    </div>
                  </div>

                  {/* Blue Adjustments */}
                  <div className="flex items-center justify-between bg-slate-950/60 border border-sky-500/40 rounded-lg p-1.5">
                    <span className="text-[11px] font-bold text-sky-300">Blue:</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          haptics.hapticChip();
                          onAdjustBet?.('player', -50);
                        }}
                        className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-black cursor-pointer"
                        title="Decrease Blue by 50 RC"
                      >
                        -50
                      </button>
                      <button
                        onClick={() => {
                          haptics.hapticChip();
                          onAdjustBet?.('player', +50);
                        }}
                        className="px-2 py-0.5 rounded bg-sky-500/30 hover:bg-sky-500/40 text-sky-200 text-xs font-black cursor-pointer"
                        title="Increase Blue by 50 RC"
                      >
                        +50
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Match / Auto Balance Button */}
                <button
                  onClick={() => {
                    haptics.hapticChip();
                    onQuickBalance?.();
                  }}
                  className="w-full py-2 px-2.5 sm:px-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:brightness-110 text-slate-950 font-black text-xs cursor-pointer shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <Scale className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">EQUALISE &amp; MATCH POOLS ({Math.abs((Number(redTotal) || 0) - (Number(blueTotal) || 0))} RC)</span>
                </button>
              </div>
            ) : (
              <div className="text-center py-1 text-xs font-black text-emerald-300 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Bets are balanced at {redTotal} RC on both sides! Ready to deal.</span>
              </div>
            )}
          </div>
        )}

        {/* STEP 8: DEALING CARDS (When YOU are the Shuffler / Dealer) */}
        {(phase === 'dealing' || (phase === 'balancing' && isBalanced)) && isHumanDealer && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                haptics.hapticCardFlick();
                onDealOne();
              }}
              disabled={isBusy || isAutoDealing || !isBalanced}
              className="py-3 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 active:translate-y-0.5 border border-yellow-200 shadow-[0_3px_0_#92400e] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>DEAL CARD</span>
            </button>

            <button
              onClick={() => {
                haptics.hapticTap();
                onAutoDeal();
              }}
              disabled={(isBusy && !isAutoDealing) || !isBalanced}
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
      </div>
    </div>
  );
};
