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
  ShieldCheck,
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

const CAMERA_OPTIONS: { id: CameraView; label: string; desc: string }[] = [
  { id: 'felt', label: 'Overview', desc: 'Overhead view' },
  { id: 'player', label: 'Seat POV', desc: 'First person' },
  { id: 'pedestal', label: 'Hukam View', desc: 'Point card focus' },
  { id: 'cinematic', label: 'Orbit 3D', desc: 'Dynamic camera' },
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
      aria-label="Royal Casino Settings"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-gradient-to-b from-[#0a1816] via-[#0b141f] to-[#060b11] border-2 border-amber-500/35 p-4 sm:p-6 shadow-[0_25px_70px_rgba(0,0,0,0.92),0_0_40px_rgba(245,158,11,0.12)] text-slate-100 flex flex-col gap-4">
        {/* Royal Casino Header */}
        <div className="flex items-center justify-between border-b border-amber-500/20 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/30 border border-amber-400/50 flex items-center justify-center text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]">
              <Crown className="w-5 h-5 text-amber-400" />
              <Sparkles className="w-2.5 h-2.5 text-yellow-200 absolute -top-1 -right-1 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-widest text-amber-300 uppercase font-serif">
                  Royal Katti
                </h2>
                <span className="text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-400/40">
                  Settings
                </span>
              </div>
              <p className="text-[11px] text-emerald-300/80 font-medium">
                Audio Volume • 3D Camera • Table Seats
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Settings"
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400 text-slate-300 hover:text-amber-200 cursor-pointer transition-all shadow-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Master Sound Volume Control (0 - 100% Bar) */}
        <div className="rounded-2xl bg-gradient-to-r from-emerald-950/40 to-slate-900/60 border border-amber-500/25 p-3.5 sm:p-4 flex flex-col gap-3 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                <Sliders className="w-4 h-4" />
              </div>
              <span className="text-xs font-black tracking-wider text-slate-200 uppercase">
                Master Sound FX Volume
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-mono font-black px-2.5 py-0.5 rounded-full border ${
                  effectiveVolume === 0
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                }`}
              >
                {effectiveVolume}%
              </span>

              <button
                onClick={onToggleMute}
                title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
                className={`p-1.5 rounded-lg border cursor-pointer transition-all ${
                  isMuted
                    ? 'bg-rose-500/25 border-rose-400 text-rose-300 hover:bg-rose-500/35'
                    : 'bg-amber-500/20 border-amber-400/50 text-amber-300 hover:bg-amber-500/30'
                }`}
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4" />
                ) : volume > 50 ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <Volume1 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Interactive Volume Slider Bar */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="relative flex items-center">
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={effectiveVolume}
                onChange={handleSliderChange}
                onMouseUp={handleSliderRelease}
                onTouchEnd={handleSliderRelease}
                aria-label="Sound Volume Slider (0 to 100 percent)"
                className="w-full h-2.5 rounded-lg appearance-none cursor-pointer bg-slate-900 border border-amber-500/30 accent-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                style={{
                  background: `linear-gradient(to right, #f59e0b 0%, #10b981 ${effectiveVolume}%, #1e293b ${effectiveVolume}%, #1e293b 100%)`,
                }}
              />
            </div>

            {/* Quick volume presets */}
            <div className="flex items-center justify-between pt-1">
              {VOLUME_PRESETS.map((p) => {
                const isActive = effectiveVolume === p;
                return (
                  <button
                    key={p}
                    onClick={() => {
                      onVolumeChange(p);
                      if (p > 0) soundEngine.playChipClick();
                    }}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold transition-all border cursor-pointer ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 border-yellow-200 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                        : 'bg-slate-900/60 text-slate-400 border-white/10 hover:border-amber-400/40 hover:text-amber-200'
                    }`}
                  >
                    {p === 0 ? 'Mute' : `${p}%`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bot Speed & Security */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Bot Speed Mode */}
          <button
            onClick={onToggleBotFastMode}
            className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
              botFastMode
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-amber-400/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-lg border flex items-center justify-center ${
                  botFastMode
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-white/5 border-white/10 text-slate-400'
                }`}
              >
                <Zap className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-xs font-black block">Bot Speed</span>
                <span className="text-[10px] text-slate-400">Deal &amp; bet pace</span>
              </div>
            </div>
            <span
              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                botFastMode
                  ? 'bg-amber-400 text-slate-950 border-yellow-200'
                  : 'bg-white/5 text-slate-400 border-white/10'
              }`}
            >
              {botFastMode ? '2x FAST' : '1x NORMAL'}
            </span>
          </button>

          {/* Quick Security Badge */}
          <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-300">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="text-xs font-black text-emerald-200 block">Security</span>
                <span className="text-[10px] text-slate-400">Cloud SQL &amp; Scrypt</span>
              </div>
            </div>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              ACTIVE
            </span>
          </div>
        </div>

        {/* 3D Camera Angles */}
        <div className="rounded-2xl bg-slate-900/60 border border-amber-500/20 p-3.5 flex flex-col gap-2">
          <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>3D Camera Perspective (Shortcut: C)</span>
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {CAMERA_OPTIONS.map((c) => {
              const isSelected = cameraView === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelectCameraView(c.id)}
                  className={`py-2 px-2.5 rounded-xl text-center border cursor-pointer transition-all flex flex-col items-center gap-0.5 ${
                    isSelected
                      ? 'bg-gradient-to-b from-amber-400 to-yellow-500 text-slate-950 border-yellow-200 font-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                      : 'bg-slate-950/80 text-slate-300 border-white/10 hover:border-amber-400/40 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-xs font-black">{c.label}</span>
                  <span
                    className={`text-[9px] ${
                      isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {c.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 6-Seat Table Ring Selector (A - F) */}
        <div className="rounded-2xl bg-slate-900/60 border border-amber-500/20 p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-300 uppercase tracking-wider">
              Switch Your Table Seat (6-Seat Ring)
            </span>
            <span className="text-[10px] font-bold text-amber-300">
              Total Pool: 6,000 RC
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
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
                  className={`p-2 rounded-xl border text-center flex flex-col items-center gap-0.5 cursor-pointer transition-all ${
                    isYou
                      ? 'bg-gradient-to-b from-emerald-500/30 to-emerald-600/20 border-emerald-400 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                      : 'bg-slate-950/80 border-white/10 text-slate-300 hover:border-amber-400/40'
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs font-black">
                    <span>Seat {s.id}</span>
                    {isDealer && <Crown className="w-3 h-3 text-amber-400" />}
                    {isCutter && <Scissors className="w-3 h-3 text-sky-400" />}
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {s.balance} RC
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase ${
                      isYou
                        ? 'text-emerald-300 font-black'
                        : isDealer
                        ? 'text-amber-400'
                        : isCutter
                        ? 'text-sky-400'
                        : 'text-slate-500'
                    }`}
                  >
                    {isYou ? 'YOU' : isDealer ? 'Dealer' : isCutter ? 'Cutter' : 'Bot'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Actions (New Hand / Title) */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => {
              onRestartRound();
              onClose();
            }}
            className="py-2.5 px-3 rounded-xl font-bold text-xs text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Hand</span>
          </button>

          <button
            onClick={() => {
              onReturnTitle();
              onClose();
            }}
            className="py-2.5 px-3 rounded-xl font-bold text-xs text-slate-300 bg-slate-900/80 hover:bg-white/10 border border-white/15 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Title Screen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
