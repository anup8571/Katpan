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
  Mic,
  MicOff,
} from 'lucide-react';
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
  onToggleVoiceMic?: () => void;
  isVoiceConnected?: boolean;
  isVoiceMuted?: boolean;
  isLocalSpeaking?: boolean;
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
  onToggleVoiceMic,
  isVoiceConnected = false,
  isVoiceMuted = false,
  isLocalSpeaking = false,
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
    <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-3 pointer-events-none select-none">
      <div className="pointer-events-auto bg-slate-950/80 backdrop-blur-xl border border-amber-400/40 rounded-2xl p-3 shadow-[0_12px_40px_rgba(0,0,0,0.8)] flex flex-col gap-2.5">
        {/* Live Step Status Strip */}
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="flex items-center gap-1.5 text-xs font-bold text-amber-100 truncate min-w-0">
            {((phase === 'shuffling' && !isHumanDealer) ||
              (phase === 'cutting' && !isHumanCutter) ||
              (phase === 'betting' && !isHumanBetTurn) ||
              (phase === 'dealing' && !isHumanDealer)) && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
            )}
            <span className="truncate">{statusText}</span>
          </span>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Quick Mic Toggle if in Voice Chat */}
            {isVoiceConnected && onToggleVoiceMic && (
              <button
                type="button"
                onClick={onToggleVoiceMic}
                title={isVoiceMuted ? 'Unmute Mic' : 'Mute Mic'}
                className={`p-1 rounded-full border text-[10px] font-black transition-all cursor-pointer flex items-center justify-center ${
                  isVoiceMuted
                    ? 'bg-rose-500/20 border-rose-400/50 text-rose-300 hover:bg-rose-500/30'
                    : isLocalSpeaking
                    ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                }`}
              >
                {isVoiceMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              </button>
            )}

            {/* Quick Bot Speed 2x Pill Toggle in Dock */}
            <button
              onClick={onToggleBotFastMode}
              className={`px-2 py-0.5 rounded-full text-[10px] font-black border transition-all cursor-pointer shrink-0 ${
                botFastMode
                  ? 'bg-amber-400 text-slate-950 border-yellow-200'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'
              }`}
              title="Toggle Fast Auto Dealing Speed"
            >
              {botFastMode ? '⚡ 2X' : '1X'}
            </button>
          </div>
        </div>

        {/* POOL EQUALIZATION MONITOR (Two-Sided Red vs Blue Totalizer) */}
        {showPoolTracker && (
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
              {/* Red (Shuffler Side) */}
              <div className="flex items-center gap-1.5 text-rose-400">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>RED POOL:</span>
                <span className="font-mono text-xs text-white bg-rose-950/80 px-1.5 py-0.5 rounded border border-rose-500/50">
                  {redTotal} RC
                </span>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-1">
                {isBalanced ? (
                  <span className="text-[10px] font-black text-emerald-400 bg-emerald-950/60 border border-emerald-500/50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    MATCHED
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-500/50 px-2 py-0.5 rounded-full">
                    DIFF: {Math.abs(redTotal - blueTotal)} RC
                  </span>
                )}
              </div>

              {/* Blue (Cutter Side) */}
              <div className="flex items-center gap-1.5 text-sky-400">
                <span>BLUE POOL:</span>
                <span className="font-mono text-xs text-white bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-500/50">
                  {blueTotal} RC
                </span>
                <Scissors className="w-3.5 h-3.5 text-sky-400" />
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
            onClick={onPlayerShuffle}
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
                  const parsed = parseInt(e.target.value, 10);
                  if (!isNaN(parsed)) {
                    onChangeCutIndex(parsed);
                  }
                }}
                className="w-full accent-amber-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>

            <button
              onClick={() => onConfirmCut()}
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
            <div className="flex items-center justify-between gap-2 bg-slate-900/65 border border-slate-800 rounded-xl px-2.5 py-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-200">
                Wager (RC):
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
                      {value}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    soundEngine.playChipClick();
                    onRandomizeBet();
                  }}
                  title="Pick Random Wager"
                  className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-[10px] font-black text-amber-200 flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Dices className="w-3 h-3 text-amber-300" />
                  <span>Random</span>
                </button>
              </div>
            </div>

            {/* CUTTER BETS FIRST: Locked to Blue / Cutter Side */}
            {isHumanCutter ? (
              <button
                onClick={() => onPlaceHumanBet('player')}
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
                onClick={() => onPlaceHumanBet('dealer')}
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
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => onPlaceHumanBet('dealer')}
                  className="py-2 px-2 rounded-xl font-black text-xs text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:brightness-110 border border-rose-300 shadow-[0_3px_0_#881337] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all"
                >
                  <span className="flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-300" />
                    <span>BET RED</span>
                  </span>
                  <span className="text-[10px] font-bold text-rose-100/90 mt-0.5">
                    {currentBet} RC
                  </span>
                </button>

                <button
                  onClick={() => onPlaceHumanBet('player')}
                  className="py-2 px-2 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-[0_3px_0_#0369a1] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all"
                >
                  <span className="flex items-center gap-1">
                    <Scissors className="w-3 h-3" />
                    <span>BET BLUE</span>
                  </span>
                  <span className="text-[10px] font-extrabold text-slate-900/85 mt-0.5">
                    {currentBet} RC
                  </span>
                </button>

                <button
                  onClick={() => onSkipHumanBet?.()}
                  className="py-2 px-2 rounded-xl font-black text-xs text-yellow-300 bg-slate-900 hover:bg-slate-800 border border-yellow-400/50 shadow-[0_3px_0_#713f12] active:translate-y-0.5 flex flex-col items-center justify-center leading-tight cursor-pointer transition-all"
                  title="Skip this round — indicator remains yellow"
                >
                  <span className="flex items-center gap-1">
                    <Ban className="w-3 h-3 text-yellow-400" />
                    <span>SKIP BET</span>
                  </span>
                  <span className="text-[9px] font-bold text-yellow-200/70 mt-0.5">
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
                        onClick={() => onAdjustBet?.('dealer', -50)}
                        className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-black cursor-pointer"
                        title="Decrease Red by 50 RC"
                      >
                        -50
                      </button>
                      <button
                        onClick={() => onAdjustBet?.('dealer', +50)}
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
                        onClick={() => onAdjustBet?.('player', -50)}
                        className="px-2 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-black cursor-pointer"
                        title="Decrease Blue by 50 RC"
                      >
                        -50
                      </button>
                      <button
                        onClick={() => onAdjustBet?.('player', +50)}
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
                  onClick={onQuickBalance}
                  className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:brightness-110 text-slate-950 font-black text-xs cursor-pointer shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>EQUALISE &amp; MATCH POOLS ({Math.abs((Number(redTotal) || 0) - (Number(blueTotal) || 0))} RC Difference)</span>
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
              onClick={onDealOne}
              disabled={isBusy || isAutoDealing || !isBalanced}
              className="py-3 px-4 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 active:translate-y-0.5 border border-yellow-200 shadow-[0_3px_0_#92400e] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>DEAL CARD</span>
            </button>

            <button
              onClick={onAutoDeal}
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
