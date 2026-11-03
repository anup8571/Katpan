import React, { useState, useEffect } from 'react';
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
  Vibrate,
  Smartphone,
  Sliders,
  CheckCircle2,
  Sparkles,
  Info,
  HelpCircle,
  AlertTriangle,
  Radio,
} from 'lucide-react';
import { CameraView, SeatId, SeatInfo } from '../game/types';
import { soundEngine } from '../game/audio';
import { haptics, HapticIntensity } from '../game/haptics';

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

const INTENSITY_OPTIONS: { id: HapticIntensity; label: string; desc: string }[] = [
  { id: 'light', label: 'Light', desc: '0.7x Gentle' },
  { id: 'medium', label: 'Medium', desc: '1.1x Crisp' },
  { id: 'strong', label: 'Strong', desc: '1.6x Punchy' },
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
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => haptics.isEnabled());
  const [hapticIntensity, setHapticIntensity] = useState<HapticIntensity>(() =>
    haptics.getIntensity()
  );
  const [testPulseActive, setTestPulseActive] = useState(false);
  const [showPermGuide, setShowPermGuide] = useState(true);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);

  const isVibrateSupported = haptics.isSupported();
  const diagnostics = haptics.getDiagnostics();

  useEffect(() => {
    if (isOpen) {
      setHapticEnabled(haptics.isEnabled());
      setHapticIntensity(haptics.getIntensity());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    onVolumeChange(val);
  };

  const handleSliderRelease = () => {
    soundEngine.playCardFlick(1.0);
    haptics.hapticTap();
  };

  const handleToggleHaptics = () => {
    const next = !hapticEnabled;
    setHapticEnabled(next);
    haptics.setEnabled(next);
    if (next) {
      triggerTestFeedback('tap', [40]);
    }
  };

  const handleSelectIntensity = (intensity: HapticIntensity) => {
    setHapticIntensity(intensity);
    haptics.setIntensity(intensity);
  };

  const triggerTestFeedback = (
    name: 'tap' | 'chip' | 'rumble',
    customPattern?: number[]
  ) => {
    setTestPulseActive(true);

    let pattern: number | number[] = [60, 40, 120];
    if (name === 'tap') pattern = 40;
    else if (name === 'chip') pattern = [35, 30, 35];
    else if (name === 'rumble') pattern = [90, 50, 160, 60, 220];

    if (customPattern) pattern = customPattern;

    // Trigger synchronously inside direct user click event
    const motorAccepted = haptics.trigger(pattern);

    if (name === 'chip') {
      soundEngine.playChipClick();
    } else {
      soundEngine.playCardFlick(1.1);
    }

    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    if (motorAccepted) {
      setLastFeedback(
        `⚡ [${timeStr}] Hardware motor accepted signal & acoustic sub-bass diaphragm kicked!`
      );
    } else if (diagnostics.isMobile) {
      setLastFeedback(
        `⚡ [${timeStr}] Vibration sent! Sub-bass speaker kick active. (If phone didn't vibrate, check phone Sound & Vibration settings).`
      );
    } else {
      setLastFeedback(
        `⚡ [${timeStr}] Acoustic sub-bass tactile kick active! (Note: Laptops & Desktop PCs lack physical vibration motors).`
      );
    }

    setTimeout(() => setTestPulseActive(false), 420);
  };

  const effectiveVolume = isMuted ? 0 : volume;

  return (
    <div
      role="dialog"
      aria-label="Royal Casino Settings & Preferences"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md select-none animate-fadeIn"
    >
      <div
        className={`w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-3xl bg-gradient-to-b from-[#0a1816] via-[#0b141f] to-[#060b11] border-2 border-amber-500/35 p-4 sm:p-6 shadow-[0_25px_70px_rgba(0,0,0,0.92),0_0_40px_rgba(245,158,11,0.12)] text-slate-100 flex flex-col gap-4.5 transition-transform duration-100 ${
          testPulseActive ? 'scale-[0.995] translate-y-0.5' : ''
        }`}
      >
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
                Audio Volume • Haptic Vibrations • 3D Camera • Table Seats
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              haptics.hapticTap();
              onClose();
            }}
            aria-label="Close Settings"
            className="p-2 rounded-xl bg-slate-900/80 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400 text-slate-300 hover:text-amber-200 cursor-pointer transition-all shadow-sm"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ======================================================== */}
        {/* SECTION 1: MASTER SOUND VOLUME CONTROL (0 - 100% BAR) */}
        {/* ======================================================== */}
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
                onClick={() => {
                  haptics.hapticTap();
                  onToggleMute();
                }}
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
                      haptics.hapticTap();
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

        {/* ======================================================== */}
        {/* SECTION 2: TACTILE HAPTIC VIBRATION FEEDBACK */}
        {/* ======================================================== */}
        <div className="rounded-2xl bg-gradient-to-r from-slate-900/70 to-emerald-950/30 border border-amber-500/25 p-3.5 sm:p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                  hapticEnabled
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : 'bg-white/5 border-white/10 text-slate-500'
                }`}
              >
                <Vibrate className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-black tracking-wider text-slate-200 uppercase">
                  Vibration Feedback
                </span>
                <p className="text-[10px] text-slate-400">
                  Dual-layer physical motor &amp; acoustic sub-bass diaphragm kick
                </p>
              </div>
            </div>

            {/* Toggle switch */}
            <button
              onClick={handleToggleHaptics}
              className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none ${
                hapticEnabled
                  ? 'bg-amber-500 border-amber-300'
                  : 'bg-slate-800 border-slate-600'
              }`}
              role="switch"
              aria-checked={hapticEnabled}
              aria-label="Toggle Vibration Feedback"
            >
              <span
                className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out mt-0.5 ${
                  hapticEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Intensity selector buttons */}
          <div className="grid grid-cols-3 gap-2">
            {INTENSITY_OPTIONS.map((opt) => {
              const isSelected = hapticIntensity === opt.id && hapticEnabled;
              return (
                <button
                  key={opt.id}
                  disabled={!hapticEnabled}
                  onClick={() => handleSelectIntensity(opt.id)}
                  className={`p-2 rounded-xl border text-center flex flex-col items-center gap-0.5 cursor-pointer transition-all ${
                    !hapticEnabled
                      ? 'opacity-40 cursor-not-allowed bg-slate-900/40 border-white/5 text-slate-500'
                      : isSelected
                      ? 'bg-gradient-to-b from-amber-500/30 to-amber-600/20 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                      : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-amber-400/40'
                  }`}
                >
                  <span className="text-xs font-black">{opt.label}</span>
                  <span className="text-[9px] font-mono text-slate-400">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          {/* Multi-Test Vibration Station */}
          <div className="flex flex-col gap-2 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Test Haptic Triggers:</span>
              </span>
              <span className="text-[10px] text-amber-400/90 font-mono">
                Direct User Gesture
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => triggerTestFeedback('tap')}
                disabled={!hapticEnabled}
                className="py-2 px-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-xs font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all disabled:opacity-40"
              >
                <span>Quick Tap</span>
                <span className="text-[9px] font-mono text-slate-400">40ms Pulse</span>
              </button>

              <button
                onClick={() => triggerTestFeedback('chip')}
                disabled={!hapticEnabled}
                className="py-2 px-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-xs font-bold flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all disabled:opacity-40"
              >
                <span>Chip Click</span>
                <span className="text-[9px] font-mono text-slate-400">Double Pulse</span>
              </button>

              <button
                onClick={() => triggerTestFeedback('rumble')}
                disabled={!hapticEnabled}
                className="py-2 px-2 rounded-xl bg-gradient-to-r from-amber-500/25 to-yellow-500/25 hover:brightness-125 border border-yellow-300/50 text-yellow-100 text-xs font-black flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all shadow-[0_0_10px_rgba(245,158,11,0.2)] disabled:opacity-40"
              >
                <span>Heavy Rumble</span>
                <span className="text-[9px] font-mono text-yellow-300/80">
                  Win Fanfare
                </span>
              </button>
            </div>

            {/* Test Status Banner */}
            {lastFeedback && (
              <div className="p-2 rounded-xl bg-slate-950/90 border border-emerald-500/40 text-[10px] text-emerald-300 font-mono flex items-center gap-1.5 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{lastFeedback}</span>
              </div>
            )}
          </div>

          {/* Browser Permission & Diagnostics Guide (Answers User Question) */}
          <div className="rounded-xl bg-slate-950/70 border border-amber-500/20 p-2.5 flex flex-col gap-2">
            <button
              onClick={() => setShowPermGuide((v) => !v)}
              className="flex items-center justify-between text-left text-[11px] font-bold text-amber-300 cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Why didn't my browser ask for permission?</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {showPermGuide ? 'Hide' : 'Details'}
              </span>
            </button>

            {showPermGuide && (
              <div className="text-[10px] text-slate-300 leading-relaxed flex flex-col gap-1.5 pt-1 border-t border-white/5">
                <p>
                  <strong className="text-amber-200">1. No Popup Exists by Web Standard:</strong> The W3C Web Vibration API does <em>not</em> trigger a browser permission prompt (unlike camera/microphone). Browsers execute vibration automatically upon direct touch gestures.
                </p>
                <p>
                  <strong className="text-amber-200">2. Device Hardware &amp; OS Settings:</strong>
                  {diagnostics.isMobile ? (
                    <span> You are on a mobile device. If your phone still does not physically vibrate, ensure <strong>Touch Vibration / Haptic Feedback</strong> is enabled in your Android/Phone <em>Settings &gt; Sound &amp; Vibration</em>.</span>
                  ) : (
                    <span> Desktop PCs and laptops do <strong>not</strong> contain physical vibration motors. On desktop, our engine automatically kicks the speaker transducer (50Hz sub-bass tactile pulse) to simulate physical impact.</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[9px] text-slate-400">
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    API: {isVibrateSupported ? 'Available' : 'Unsupported'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    Device: {diagnostics.isMobile ? 'Mobile Phone' : 'Desktop PC / Mac'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                    Diaphragm Kick: Active
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* SECTION 3: BOT SPEED & 3D CAMERA PERSPECTIVES */}
        {/* ======================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Bot Speed Mode */}
          <button
            onClick={() => {
              haptics.hapticTap();
              onToggleBotFastMode();
            }}
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
                  onClick={() => {
                    haptics.hapticTap();
                    onSelectCameraView(c.id);
                  }}
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

        {/* ======================================================== */}
        {/* SECTION 4: 6-SEAT TABLE RING SELECTOR (A - F) */}
        {/* ======================================================== */}
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
                    haptics.hapticTap();
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

        {/* ======================================================== */}
        {/* SECTION 5: QUICK ACTIONS (NEW HAND / TITLE) */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => {
              haptics.hapticCardFlick();
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
              haptics.hapticTap();
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
