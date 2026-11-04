import React from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Volume1,
  Zap,
  Camera,
  RotateCcw,
  Home,
  Crown,
  Scissors,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { CameraView, SeatId, SeatInfo } from '../game/types';
import { soundEngine } from '../game/audio';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
  botFastMode: boolean;
  onToggleBotFastMode: () => void;
  cameraView: CameraView;
  onSelectCameraView: (view: CameraView) => void;
  humanSeat: SeatId;
  dealerSeat: SeatId;
  cutterSeat: SeatId;
  seats: SeatInfo[];
  onSelectHumanSeat: (seat: SeatId) => void;
  onRestartRound: () => void;
  onReturnTitle: () => void;
}

const CAMERA_OPTIONS: { id: CameraView; label: string }[] = [
  { id: 'felt', label: 'Overview' },
  { id: 'player', label: 'Seat POV' },
  { id: 'pedestal', label: 'Hukam' },
  { id: 'cinematic', label: 'Orbit 3D' },
];

const VOLUME_PRESETS = [0, 25, 50, 75, 100];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isMuted,
  onToggleMute,
  volume,
  onVolumeChange,
  botFastMode,
  onToggleBotFastMode,
  cameraView,
  onSelectCameraView,
  humanSeat,
  dealerSeat,
  cutterSeat,
  seats,
  onSelectHumanSeat,
  onRestartRound,
  onReturnTitle,
}) => {
  if (!isOpen) return null;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    onVolumeChange(val);
  };

  const handleSliderRelease = () => {
    soundEngine.playCardFlick(1.0);
  };

  const effectiveVolume = isMuted ? 0 : volume;

  return (
    <div
      role="dialog"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md select-none animate-fadeIn"
    >
      {/* Self-contained modal that strictly fits on mobile viewports */}
      <div className="w-full max-w-sm sm:max-w-md max-h-[82dvh] flex flex-col rounded-2xl bg-gradient-to-b from-[#0a1816] via-[#0b141f] to-[#060b11] border border-amber-500/40 shadow-[0_20px_50px_rgba(0,0,0,0.9)] text-slate-100 overflow-hidden">
        {/* Sticky Header — Close button is ALWAYS on-screen */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/20 bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Crown className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-xs sm:text-sm font-black tracking-wider text-amber-300 uppercase">
              Table Settings
            </h2>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
          {/* Sound Volume Control (0 - 100%) */}
          <div className="rounded-xl bg-slate-900/70 border border-amber-500/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Volume</span>
              </span>

              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  {effectiveVolume}%
                </span>
                <button
                  onClick={onToggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  className={`p-1.5 rounded-lg border cursor-pointer ${
                    isMuted
                      ? 'bg-rose-500/20 border-rose-400/50 text-rose-300'
                      : 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                  }`}
                >
                  {isMuted ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : volume > 50 ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <Volume1 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={effectiveVolume}
              onChange={handleSliderChange}
              onMouseUp={handleSliderRelease}
              onTouchEnd={handleSliderRelease}
              aria-label="Volume (0-100%)"
              className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-slate-800 accent-amber-400"
              style={{
                background: `linear-gradient(to right, #f59e0b 0%, #10b981 ${effectiveVolume}%, #1e293b ${effectiveVolume}%, #1e293b 100%)`,
              }}
            />

            {/* Presets */}
            <div className="flex items-center justify-between pt-0.5">
              {VOLUME_PRESETS.map((p) => {
                const isActive = effectiveVolume === p;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      onVolumeChange(p);
                      if (p > 0) soundEngine.playChipClick();
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 border-yellow-200'
                        : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {p === 0 ? 'Mute' : `${p}%`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bot Speed Mode */}
          <div className="flex items-center justify-between rounded-xl bg-slate-900/70 border border-amber-500/20 p-2.5">
            <span className="font-bold text-slate-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Bot Dealing Speed</span>
            </span>
            <button
              onClick={onToggleBotFastMode}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer ${
                botFastMode
                  ? 'bg-amber-400 text-slate-950 border-yellow-200'
                  : 'bg-white/5 text-slate-400 border-white/10'
              }`}
            >
              {botFastMode ? '2X FAST' : '1X NORMAL'}
            </button>
          </div>

          {/* 3D Camera Angles */}
          <div className="rounded-xl bg-slate-900/70 border border-amber-500/20 p-2.5 space-y-1.5">
            <span className="font-bold text-slate-200 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span>3D Camera</span>
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {CAMERA_OPTIONS.map((c) => {
                const isSelected = cameraView === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelectCameraView(c.id)}
                    className={`py-1.5 px-1 rounded-lg text-center border font-bold text-[11px] cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950 border-yellow-200'
                        : 'bg-slate-950 text-slate-300 border-white/10 hover:text-white'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table Seat Switcher (A - F) */}
          <div className="rounded-xl bg-slate-900/70 border border-amber-500/20 p-2.5 space-y-1.5">
            <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider block">
              Switch Seat (3 vs 3 Ring)
            </span>
            <div className="grid grid-cols-6 gap-1">
              {seats.map((s) => {
                const isYou = s.id === humanSeat;
                const isDealer = s.id === dealerSeat;
                const isCutter = s.id === cutterSeat;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      onSelectHumanSeat(s.id);
                      onClose();
                    }}
                    className={`p-1.5 rounded-lg border text-center flex flex-col items-center gap-0.5 cursor-pointer transition-all ${
                      isYou
                        ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 font-black'
                        : 'bg-slate-950 border-white/10 text-slate-300 hover:border-amber-400/40'
                    }`}
                  >
                    <span className="text-[11px] font-black">{s.id}</span>
                    <span className="text-[9px] text-slate-400">
                      {isDealer ? 'D' : isCutter ? 'C' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sticky Bottom Actions */}
        <div className="grid grid-cols-2 gap-2 p-3 border-t border-amber-500/20 bg-slate-950/40 shrink-0">
          <button
            onClick={() => {
              onRestartRound();
              onClose();
            }}
            className="py-2 px-3 rounded-xl font-bold text-xs text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Hand</span>
          </button>

          <button
            onClick={() => {
              onReturnTitle();
              onClose();
            }}
            className="py-2 px-3 rounded-xl font-bold text-xs text-slate-300 bg-slate-900 hover:bg-white/10 border border-white/15 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Title Screen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
