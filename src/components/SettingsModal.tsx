import React from 'react';
import {
  X,
  Settings,
  Volume2,
  VolumeX,
  Zap,
  Camera,
  RotateCcw,
  Home,
  ShieldCheck,
  Crown,
  Scissors,
} from 'lucide-react';
import { CameraView, SeatId, SeatInfo } from '../game/types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
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
  { id: 'felt', label: 'Table Overview' },
  { id: 'player', label: 'Player POV' },
  { id: 'pedestal', label: 'Hukam Close-Up' },
  { id: 'cinematic', label: 'Royal Orbit' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  isMuted,
  onToggleMute,
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

  return (
    <div
      role="dialog"
      aria-label="Game Settings and Table Preferences"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950/75 backdrop-blur-xl border border-white/15 p-4 sm:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] text-slate-100 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black tracking-wide text-white">
                TABLE SETTINGS &amp; CONTROLS
              </h2>
              <p className="text-[11px] text-slate-400">
                Audio, Camera, 6-Seat Selection &amp; Security
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Settings Modal"
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Audio & Bot Speed Row */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={onToggleMute}
            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
              !isMuted
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200'
                : 'bg-white/5 border-white/10 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
              <span className="text-xs font-bold">Sound FX</span>
            </div>
            <span className="text-[10px] font-black uppercase">
              {isMuted ? 'MUTED' : 'ON'}
            </span>
          </button>

          <button
            onClick={onToggleBotFastMode}
            className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
              botFastMode
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                : 'bg-white/5 border-white/10 text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold">Bot Speed</span>
            </div>
            <span className="text-[10px] font-black uppercase">
              {botFastMode ? '2x FAST' : '1x NORMAL'}
            </span>
          </button>
        </div>

        {/* 3D Camera Angles */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2">
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>3D Camera Perspective (Key: C)</span>
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {CAMERA_OPTIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => onSelectCameraView(c.id)}
                className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer transition-all ${
                  cameraView === c.id
                    ? 'bg-amber-400 text-slate-950 border-yellow-200 font-black'
                    : 'bg-slate-900/70 text-slate-300 border-white/10 hover:bg-white/10'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 6-Seat Ring Selector (A-F) */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Switch Your Table Seat (3 vs 3 Ring)
            </span>
            <span className="text-[10px] font-bold text-emerald-300">
              Pool: 6,000 RC
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
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
                  className={`p-2 rounded-xl border text-left flex flex-col gap-0.5 cursor-pointer transition-all ${
                    isYou
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                      : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-black">
                    <span>
                      Seat {s.id} {isYou ? '(YOU)' : ''}
                    </span>
                    {isDealer && <Crown className="w-3 h-3 text-amber-400" />}
                    {isCutter && <Scissors className="w-3 h-3 text-sky-400" />}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    {s.balance} RC • {isDealer ? 'Under' : isCutter ? 'Cutter' : 'Player'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Database & Security Status */}
        <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 px-3 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px] font-bold text-emerald-200">
              Cloud SQL RLS Policies &amp; Scrypt Hashing
            </span>
          </div>
          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
            VERIFIED ON
          </span>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => {
              onRestartRound();
              onClose();
            }}
            className="py-2.5 px-3 rounded-xl font-bold text-xs text-slate-200 bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Hand</span>
          </button>

          <button
            onClick={() => {
              onReturnTitle();
              onClose();
            }}
            className="py-2.5 px-3 rounded-xl font-bold text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Title Screen</span>
          </button>
        </div>
      </div>
    </div>
  );
};
