import React from 'react';
import { GamePhase, SeatId, Side } from '../game/types';
import {
  Shuffle,
  Play,
  FastForward,
  Scissors,
  Crown,
  Dices,
  Scale,
  Ban,
  CheckCircle2,
  Mic,
  MicOff,
  Settings,
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
  onOpenSettings?: () => void;
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
  onOpenSettings,
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

  const hasInteractiveControls =
    (phase === 'shuffling' && isHumanDealer) ||
    (phase === 'cutting' && isHumanCutter) ||
    isHumanBetTurn ||
    phase === 'balancing' ||
    (phase === 'dealing' && isHumanDealer);

  return (
    <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-20 w-full max-w-sm sm:max-w-md px-2.5 pointer-events-none select-none">
      <div className="pointer-events-auto bg-slate-950/85 backdrop-blur-xl border border-amber-500/35 rounded-2xl p-2.5 shadow-[0_12px_36px_rgba(0,0,0,0.85)] flex flex-col gap-2">
        {/* Sleek Top Utility Strip: Compact Pool Pill + Controls */}
        <div className="flex items-center justify-between gap-1.5 px-0.5">
          {showPoolTracker ? (
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-mono font-bold tracking-tight">
              <span className="text-rose-400 font-black flex items-center gap-0.5">
                <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                <span>{redTotal}</span>
              </span>
              <span className="text-slate-500">•</span>
              <span
                className={`px-1.5 py-0.2 rounded ${
                  isBalanced
                    ? 'text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-sans font-black'
                    : 'text-amber-300 font-sans text-[9px]'
                }`}
              >
                {isBalanced ? 'MATCHED' : `DIFF: ${Math.abs(redTotal - blueTotal)}`}
              </span>
              <span className="text-slate-500">•</span>
              <span className="text-sky-400 font-black flex items-center gap-0.5">
                <span>{blueTotal}</span>
                <Scissors className="w-3 h-3 text-sky-400 shrink-0" />
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] text-amber-300 font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>Royal Katti Table</span>
            </div>
          )}

          {/* Right Utility Buttons: Mic & Fast Mode */}
          <div className="flex items-center gap-1 shrink-0">
            {isVoiceConnected && onToggleVoiceMic && (
              <button
                type="button"
                onClick={onToggleVoiceMic}
                title={isVoiceMuted ? 'Unmute Mic' : 'Mute Mic'}
                className={`p-1 rounded-full border text-[10px] font-black cursor-pointer transition-all ${
                  isVoiceMuted
                    ? 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                    : isLocalSpeaking
                    ? 'bg-emerald-500/30 border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                }`}
              >
                {isVoiceMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
              </button>
            )}

            <button
              onClick={onToggleBotFastMode}
              className={`px-2 py-0.5 rounded-full text-[9px] font-black border transition-all cursor-pointer ${
                botFastMode
                  ? 'bg-amber-400 text-slate-950 border-yellow-200'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:text-slate-200'
              }`}
              title="Toggle Deal Speed"
            >
              {botFastMode ? '⚡ 2X' : '1X'}
            </button>

            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="p-1 rounded-full border border-amber-500/40 bg-slate-900/80 hover:bg-amber-500/20 text-amber-300 hover:text-white transition-all cursor-pointer"
                title="Settings & Audio"
                aria-label="Settings"
              >
                <Settings className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Phase-Specific Sleek Actions */}
        {/* Shuffling (Human Dealer) */}
        {phase === 'shuffling' && isHumanDealer && (
          <button
            onClick={onPlayerShuffle}
            disabled={isBusy}
            className="w-full py-2.5 px-3 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 border border-yellow-200 shadow-md active:translate-y-0.5 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>SHUFFLE &amp; PASS TO CUTTER</span>
          </button>
        )}

        {/* Cutting (Human Cutter) */}
        {phase === 'cutting' && isHumanCutter && (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-900/80 border border-slate-700/60 rounded-xl px-2 py-1.5 flex items-center gap-2">
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
              <span className="font-mono text-[10px] text-amber-300 font-bold tabular-nums shrink-0">
                {cutIndex}
              </span>
            </div>

            <button
              onClick={() => onConfirmCut()}
              disabled={isBusy}
              className="py-2.5 px-3.5 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-md active:translate-y-0.5 flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>CUT</span>
            </button>
          </div>
        )}

        {/* Betting (Human Turn) */}
        {isHumanBetTurn && (
          <div className="flex flex-col gap-2">
            {/* Chip Denominations Rack */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2">
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
                title="Random Wager"
                className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/50 text-[10px] font-black text-amber-200 flex items-center gap-1 cursor-pointer transition-all"
              >
                <Dices className="w-3 h-3 text-amber-300" />
              </button>
            </div>

            {/* Direct Betting Action Buttons */}
            {isHumanCutter ? (
              <button
                onClick={() => onPlaceHumanBet('player')}
                className="w-full py-2.5 px-3 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 via-cyan-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-md active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>BET BLUE ({currentBet} RC)</span>
              </button>
            ) : isHumanDealer ? (
              <button
                onClick={() => onPlaceHumanBet('dealer')}
                className="w-full py-2.5 px-3 rounded-xl font-black text-xs text-white bg-gradient-to-r from-rose-600 via-rose-500 to-pink-600 hover:brightness-110 border border-rose-300 shadow-md active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <Crown className="w-3.5 h-3.5 text-amber-300" />
                <span>BET RED ({currentBet} RC)</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  onClick={() => onPlaceHumanBet('dealer')}
                  className="py-2 px-1 rounded-xl font-black text-xs text-white bg-gradient-to-r from-rose-600 to-pink-600 hover:brightness-110 border border-rose-300 shadow-sm active:translate-y-0.5 cursor-pointer"
                >
                  RED {currentBet}
                </button>

                <button
                  onClick={() => onSkipHumanBet?.()}
                  className="py-2 px-1 rounded-xl font-black text-xs text-yellow-300 bg-slate-900 hover:bg-slate-800 border border-yellow-400/50 active:translate-y-0.5 cursor-pointer"
                >
                  SKIP
                </button>

                <button
                  onClick={() => onPlaceHumanBet('player')}
                  className="py-2 px-1 rounded-xl font-black text-xs text-slate-950 bg-gradient-to-r from-sky-300 to-sky-400 hover:brightness-110 border border-sky-100 shadow-sm active:translate-y-0.5 cursor-pointer"
                >
                  BLUE {currentBet}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Balancing Phase (Clean Match Button + Quick Tweak) */}
        {phase === 'balancing' && (
          <div className="flex flex-col gap-1.5">
            {!isBalanced ? (
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onAdjustBet?.('dealer', -50)}
                    className="px-2 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-black cursor-pointer border border-rose-500/30"
                    title="Red -50"
                  >
                    -50
                  </button>
                  <button
                    onClick={() => onAdjustBet?.('dealer', +50)}
                    className="px-2 py-1.5 rounded-lg bg-rose-500/30 hover:bg-rose-500/40 text-rose-200 text-xs font-black cursor-pointer border border-rose-500/40"
                    title="Red +50"
                  >
                    +50
                  </button>
                </div>

                <button
                  onClick={onQuickBalance}
                  className="flex-1 py-2 px-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:brightness-110 text-slate-950 font-black text-xs cursor-pointer shadow-md transition-all flex items-center justify-center gap-1"
                >
                  <Scale className="w-3.5 h-3.5" />
                  <span>EQUALISE ({Math.abs((Number(redTotal) || 0) - (Number(blueTotal) || 0))} RC)</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onAdjustBet?.('player', -50)}
                    className="px-2 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-xs font-black cursor-pointer border border-sky-500/30"
                    title="Blue -50"
                  >
                    -50
                  </button>
                  <button
                    onClick={() => onAdjustBet?.('player', +50)}
                    className="px-2 py-1.5 rounded-lg bg-sky-500/30 hover:bg-sky-500/40 text-sky-200 text-xs font-black cursor-pointer border border-sky-500/40"
                    title="Blue +50"
                  >
                    +50
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-0.5 text-xs font-black text-emerald-300 flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Bets Balanced ({redTotal} RC)</span>
              </div>
            )}
          </div>
        )}

        {/* Dealing Cards (Human Dealer) */}
        {(phase === 'dealing' || (phase === 'balancing' && isBalanced)) && isHumanDealer && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onDealOne}
              disabled={isBusy || isAutoDealing || !isBalanced}
              className="py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm text-slate-950 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 hover:brightness-110 active:translate-y-0.5 border border-yellow-200 shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>DEAL CARD</span>
            </button>

            <button
              onClick={onAutoDeal}
              disabled={(isBusy && !isAutoDealing) || !isBalanced}
              className={`py-2.5 px-3 rounded-xl font-black text-xs sm:text-sm hover:brightness-110 border shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isAutoDealing
                  ? 'bg-rose-600/90 text-white border-rose-300 animate-pulse'
                  : 'bg-emerald-500/90 text-slate-950 border-emerald-200 shadow-sm active:translate-y-0.5'
              }`}
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>{isAutoDealing ? 'STOP AUTO' : 'AUTO DEAL'}</span>
            </button>
          </div>
        )}

        {/* Fallback subtle indicator if awaiting bot action and no human controls active */}
        {!hasInteractiveControls && (
          <div className="py-1 text-center text-[11px] font-bold text-amber-200/90 flex items-center justify-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Table Action in Progress</span>
          </div>
        )}
      </div>
    </div>
  );
};
