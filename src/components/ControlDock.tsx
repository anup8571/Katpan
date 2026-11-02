import React, { useState, useEffect } from 'react';
import { CameraView, GamePhase } from '../game/types';
import { ChevronDown, ChevronUp, Shuffle, Play, FastForward, Eye, Scissors } from 'lucide-react';
import { soundEngine } from '../game/audio';

interface ControlDockProps {
  phase: GamePhase;
  currentBet: number;
  onSelectBet: (bet: number) => void;
  cutIndex: number;
  onChangeCutIndex: (cut: number) => void;
  onRandomCut: () => void;
  onConfirmCut: () => void;
  onDealOne: () => void;
  onAutoDeal: () => void;
  isAutoDealing: boolean;
  dealSpeed: '1x' | '2x' | 'instant';
  onChangeDealSpeed: (speed: '1x' | '2x' | 'instant') => void;
  cameraView: CameraView;
  onChangeCameraView: (view: CameraView) => void;
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
  currentBet,
  onSelectBet,
  cutIndex,
  onChangeCutIndex,
  onRandomCut,
  onConfirmCut,
  onDealOne,
  onAutoDeal,
  isAutoDealing,
  dealSpeed,
  onChangeDealSpeed,
  cameraView,
  onChangeCameraView,
  isBusy,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'KeyH') {
        e.preventDefault();
        setCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-20 w-full max-w-lg px-2.5 pointer-events-none select-none">
      {/* Collapse/Expand Toggle Tab */}
      <div className="flex justify-center">
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{ backgroundColor: 'rgba(9, 13, 22, 0.95)' }}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 border border-b-0 border-amber-500/40 rounded-t-lg text-[10px] font-bold uppercase tracking-wider text-amber-200/90 hover:text-amber-300 transition-colors cursor-pointer"
        >
          {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          <span>{collapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}</span>
        </button>
      </div>

      {/* Main Casino Control Dock */}
      {!collapsed && (
        <div
          style={{ backgroundColor: 'rgba(9, 13, 22, 0.96)' }}
          className="pointer-events-auto border border-amber-500/40 rounded-xl p-2.5 sm:p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.85)] flex flex-col gap-2.5"
        >
          {/* Phase 1: Betting & Deck Cutting */}
          {phase === 'betting' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase text-amber-200/70 tracking-wider shrink-0">
                  Wager:
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
                        disabled={isBusy}
                        style={{
                          backgroundColor: bg,
                          borderColor: isActive ? '#fde047' : border,
                          color: text,
                        }}
                        className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-dashed font-black text-[10px] sm:text-[11px] flex items-center justify-center transition-transform cursor-pointer shadow-md tabular-nums ${
                          isActive
                            ? 'scale-110 -translate-y-0.5 ring-2 ring-amber-400/70'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                      >
                        {value >= 1000 ? `${value / 1000}k` : value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3D Cut Slider */}
              <div className="bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1.5 flex flex-col gap-1">
                <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-bold text-slate-300">
                  <span className="flex items-center gap-1 text-amber-300/90">
                    <Scissors className="w-3 h-3" />
                    <span>Cut Shoe (3D Preview)</span>
                  </span>
                  <span className="font-mono text-amber-400 tabular-nums">
                    1st: {cutIndex} • 2nd: {52 - cutIndex}
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

              {/* Split Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onRandomCut}
                  disabled={isBusy}
                  className="py-2 px-3 rounded-lg font-bold text-xs bg-slate-800 hover:bg-slate-700 active:translate-y-0.5 text-slate-200 border border-slate-600 shadow flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Shuffle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Random Cut</span>
                </button>
                <button
                  onClick={onConfirmCut}
                  disabled={isBusy}
                  style={{ backgroundColor: '#d97706' }}
                  className="py-2 px-3 rounded-lg font-black text-xs hover:brightness-110 text-slate-950 border border-amber-300 shadow-[0_3px_0_#78350f] active:translate-y-0.5 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Scissors className="w-3.5 h-3.5" />
                  <span>Split &amp; Reveal Point</span>
                </button>
              </div>
            </div>
          )}

          {/* Phase 2: Dealing Cards */}
          {phase === 'dealing' && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onDealOne}
                  disabled={isBusy || isAutoDealing}
                  style={{ backgroundColor: '#b45309' }}
                  className="py-2.5 px-3 rounded-lg font-black text-xs text-amber-50 hover:brightness-110 active:translate-y-0.5 border border-amber-400/80 shadow-[0_3px_0_#451a03] flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Deal 1 Card</span>
                  <span className="hidden sm:inline text-[9px] bg-slate-950/40 px-1.5 py-0.5 rounded">
                    SPACE
                  </span>
                </button>

                <button
                  onClick={onAutoDeal}
                  disabled={isBusy && !isAutoDealing}
                  style={{
                    backgroundColor: isAutoDealing ? '#881337' : '#065f46',
                  }}
                  className={`py-2.5 px-3 rounded-lg font-black text-xs text-slate-100 hover:brightness-110 border shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isAutoDealing ? 'border-rose-400' : 'border-emerald-400/80 active:translate-y-0.5'
                  }`}
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>{isAutoDealing ? 'Stop Auto Deal' : 'Auto Deal'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between bg-slate-950/90 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[10px]">Deal Pace:</span>
                <div className="flex items-center gap-1">
                  {(['1x', '2x', 'instant'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => onChangeDealSpeed(s)}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase transition-all cursor-pointer ${
                        dealSpeed === s
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer: Camera View Selector Pills */}
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/90 text-[10px] text-slate-400">
            <span className="flex items-center gap-1 font-bold uppercase tracking-wider">
              <Eye className="w-3 h-3 text-amber-400" />
              <span className="hidden xs:inline">Camera:</span>
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'felt', label: 'Top Felt' },
                  { id: 'player', label: 'VIP Seat' },
                  { id: 'pedestal', label: 'Pedestal' },
                  { id: 'cinematic', label: 'Wide View' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => onChangeCameraView(id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                    cameraView === id
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/60'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
