/**
 * Tactile Haptic Vibration Engine for Royal Katti (Maang Patta) Casino.
 * Dual-layer architecture:
 * 1. Physical Hardware Motor via Web Vibration API (navigator.vibrate)
 * 2. Acoustic Sub-Bass Tactile Impulse (50Hz physical speaker diaphragm vibration)
 *    which guarantees tactile feedback on desktop PCs, iOS Safari, and iframe sandboxes.
 */

export type HapticIntensity = 'light' | 'medium' | 'strong';

const HAPTICS_ENABLED_KEY = 'royalkatti_haptics_enabled';
const HAPTICS_INTENSITY_KEY = 'royalkatti_haptics_intensity';

class HapticsEngine {
  private enabled: boolean = true;
  private intensity: HapticIntensity = 'medium';
  private supported: boolean = false;
  private audioCtx: AudioContext | null = null;
  private lastResult: boolean | null = null;
  private lastTriggerTime: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.supported = 'navigator' in window && 'vibrate' in navigator;
      try {
        const storedEnabled = localStorage.getItem(HAPTICS_ENABLED_KEY);
        if (storedEnabled !== null) {
          this.enabled = storedEnabled === 'true';
        }
        const storedIntensity = localStorage.getItem(HAPTICS_INTENSITY_KEY) as HapticIntensity;
        if (storedIntensity && ['light', 'medium', 'strong'].includes(storedIntensity)) {
          this.intensity = storedIntensity;
        }
      } catch {
        // Fallback to default
      }
    }
  }

  public isSupported(): boolean {
    return this.supported;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try {
      localStorage.setItem(HAPTICS_ENABLED_KEY, String(enabled));
    } catch {
      // Ignore
    }
    if (enabled) {
      this.trigger([30]);
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public getIntensity(): HapticIntensity {
    return this.intensity;
  }

  public setIntensity(intensity: HapticIntensity) {
    this.intensity = intensity;
    try {
      localStorage.setItem(HAPTICS_INTENSITY_KEY, intensity);
    } catch {
      // Ignore
    }
    this.testVibration(intensity);
  }

  private getMultiplier(): number {
    switch (this.intensity) {
      case 'light':
        return 0.7;
      case 'strong':
        return 1.6;
      case 'medium':
      default:
        return 1.1;
    }
  }

  /**
   * Sub-Bass Tactile Impulse Synthesizer (50Hz acoustic diaphragm kick).
   * On mobile phones and tablets, playing a steep 45-55Hz micro-transient
   * causes the internal speaker magnet to physically thump against the chassis,
   * producing an unmistakable tactile sensation even if navigator.vibrate is
   * restricted by iframe permissions or on iOS Safari.
   */
  private playSubBassTactileImpulse(durationMs: number = 30, freq: number = 52) {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // Steep sub-bass sine wave that pushes speaker coil
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + durationMs / 1000);

      const mult = this.getMultiplier();
      const peakGain = Math.min(1.0, 0.75 * mult);
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (durationMs / 1000) * 1.15);

      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + (durationMs / 1000) * 1.2);
    } catch {
      // Safe fallback
    }
  }

  /**
   * Dual-layer haptic trigger:
   * 1. Physical vibration motor via navigator.vibrate
   * 2. Acoustic sub-bass speaker transducer physical kick
   */
  public trigger(pattern: number | number[]): boolean {
    if (!this.enabled) return false;

    this.lastTriggerTime = Date.now();
    let vibrateResult = false;

    // 1. Hardware Motor (Web Vibration API)
    if (this.supported && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        const mult = this.getMultiplier();
        if (typeof pattern === 'number') {
          const scaled = Math.max(15, Math.round(pattern * mult));
          vibrateResult = navigator.vibrate(scaled);
        } else {
          const scaledPattern = pattern.map((dur, idx) =>
            idx % 2 === 0 ? Math.max(15, Math.round(dur * mult)) : dur
          );
          vibrateResult = navigator.vibrate(scaledPattern);
        }
      } catch {
        vibrateResult = false;
      }
    }

    this.lastResult = vibrateResult;

    // 2. Concurrently produce sub-bass physical coil kick
    const primaryDuration = typeof pattern === 'number' ? pattern : pattern[0] || 30;
    this.playSubBassTactileImpulse(Math.max(25, Math.min(75, primaryDuration)));

    return vibrateResult;
  }

  /**
   * Crisp micro-tap for UI buttons, chip selectors, and tab switches.
   */
  public hapticTap() {
    this.trigger(20);
  }

  /**
   * Snappy pulse for card deals and cut position sliding.
   */
  public hapticCardFlick() {
    this.trigger(35);
  }

  /**
   * Double-tap pulse for chip bets, equalization actions, and wagers.
   */
  public hapticChip() {
    this.trigger([30, 25, 30]);
  }

  /**
   * Solid tactile cut confirmation when user cuts the deck.
   */
  public hapticCut() {
    this.trigger([60, 30, 45]);
  }

  /**
   * Royal celebratory vibration pattern when player matches the Hukam point card!
   */
  public hapticWin() {
    this.trigger([50, 40, 80, 40, 110, 50, 180]);
  }

  /**
   * Subdued double-rumble when the opposite side wins.
   */
  public hapticDefeat() {
    this.trigger([80, 60, 120]);
  }

  /**
   * Interactive test pulse for the Settings Panel.
   * Returns whether the hardware vibration motor accepted the call.
   */
  public testVibration(customIntensity?: HapticIntensity): {
    supported: boolean;
    accepted: boolean;
  } {
    const saved = this.intensity;
    if (customIntensity) {
      this.intensity = customIntensity;
    }
    const accepted = this.trigger([70, 40, 130]);
    this.intensity = saved;
    return {
      supported: this.supported,
      accepted: accepted === true,
    };
  }

  /**
   * Diagnostics info for the user and settings inspector.
   */
  public getDiagnostics() {
    const isMobile =
      typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const isIOS =
      typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;

    return {
      supported: this.supported,
      lastResult: this.lastResult,
      lastTriggerTime: this.lastTriggerTime,
      isMobile,
      isIOS,
      inIframe,
      intensity: this.intensity,
      enabled: this.enabled,
    };
  }
}

export const haptics = new HapticsEngine();
