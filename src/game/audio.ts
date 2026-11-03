/**
 * Procedural Web Audio synthesizer for Royal Katti / Maang Patta casino sounds.
 * 100% code-synthesized with zero external asset dependencies.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private volume = 80;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedVol = localStorage.getItem('royalkatti_sound_volume');
        if (savedVol !== null) {
          const parsed = Number(savedVol);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
            this.volume = parsed;
          }
        }
        const savedMute = localStorage.getItem('royalkatti_sound_muted');
        if (savedMute !== null) {
          this.muted = savedMute === 'true';
        }
      } catch {
        // Safe fallback
      }
    }
  }

  private getMasterVolume(): number {
    if (this.muted) return 0;
    return Math.max(0, Math.min(1, this.volume / 100));
  }

  private getContext(): AudioContext | null {
    if (this.muted || this.volume <= 0) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('royalkatti_sound_muted', String(this.muted));
    } catch {
      // Ignore
    }
    return this.muted;
  }

  public setMute(mute: boolean) {
    this.muted = mute;
    try {
      localStorage.setItem('royalkatti_sound_muted', String(this.muted));
    } catch {
      // Ignore
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(val: number): number {
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    this.volume = clamped;
    if (clamped === 0) {
      this.muted = true;
    } else if (this.muted && clamped > 0) {
      this.muted = false;
    }
    try {
      localStorage.setItem('royalkatti_sound_volume', String(clamped));
      localStorage.setItem('royalkatti_sound_muted', String(this.muted));
    } catch {
      // Ignore
    }
    return this.volume;
  }

  /**
   * Crisp snappy card flick/deal sound with slight pitch variation.
   */
  public playCardFlick(pitchMultiplier = 1) {
    const masterVol = this.getMasterVolume();
    if (masterVol <= 0) return;
    const c = this.getContext();
    if (!c) return;

    try {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      const filter = c.createBiquadFilter();

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3200, now);
      filter.frequency.exponentialRampToValueAtTime(600, now + 0.07);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320 * pitchMultiplier, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.065);

      gain.gain.setValueAtTime(0.24 * masterVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001 * masterVol, now + 0.07);

      osc.connect(filter).connect(gain).connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // Audio context policy safe ignore
    }
  }

  /**
   * Realistic deck riffle shuffle with multi-card fluttering.
   */
  public playShuffleRiffle() {
    const masterVol = this.getMasterVolume();
    if (masterVol <= 0) return;
    const c = this.getContext();
    if (!c) return;

    try {
      const totalCards = 14;
      for (let i = 0; i < totalCards; i++) {
        const delay = i * 0.022;
        const now = c.currentTime + delay;

        const osc = c.createOscillator();
        const gain = c.createGain();

        osc.type = 'triangle';
        const pitch = 220 + (i % 6) * 35 + Math.random() * 20;
        osc.frequency.setValueAtTime(pitch, now);
        osc.frequency.exponentialRampToValueAtTime(70, now + 0.04);

        gain.gain.setValueAtTime(0.12 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001 * masterVol, now + 0.04);

        osc.connect(gain).connect(c.destination);
        osc.start(now);
        osc.stop(now + 0.045);
      }
    } catch {
      // Audio context safe ignore
    }
  }

  /**
   * Realistic ceramic/clay casino chip clink sound.
   */
  public playChipClick() {
    const masterVol = this.getMasterVolume();
    if (masterVol <= 0) return;
    const c = this.getContext();
    if (!c) return;

    try {
      const now = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2200 + Math.random() * 200, now);
      osc.frequency.exponentialRampToValueAtTime(980, now + 0.04);

      gain.gain.setValueAtTime(0.2 * masterVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001 * masterVol, now + 0.045);

      osc.connect(gain).connect(c.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Audio context safe ignore
    }
  }

  /**
   * Majestic golden chime when the Point Card (Hukam) is revealed.
   */
  public playHukamChime() {
    const masterVol = this.getMasterVolume();
    if (masterVol <= 0) return;
    const c = this.getContext();
    if (!c) return;

    try {
      const arpeggio = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
      arpeggio.forEach((freq, idx) => {
        const now = c.currentTime + idx * 0.05;
        const osc = c.createOscillator();
        const gain = c.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.18 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001 * masterVol, now + 0.45);

        osc.connect(gain).connect(c.destination);
        osc.start(now);
        osc.stop(now + 0.48);
      });
    } catch {
      // Audio context safe ignore
    }
  }

  /**
   * Victorious royal fanfare when Player matches the Point Card!
   */
  public playWinFanfare() {
    const masterVol = this.getMasterVolume();
    if (masterVol <= 0) return;
    const c = this.getContext();
    if (!c) return;

    try {
      const chordNotes = [
        { f: 523.25, t: 0, d: 0.15 },    // C5
        { f: 659.25, t: 0.12, d: 0.15 }, // E5
        { f: 783.99, t: 0.24, d: 0.18 }, // G5
        { f: 1046.5, t: 0.38, d: 0.5 },  // C6
        { f: 1318.5, t: 0.44, d: 0.6 },  // E6
        { f: 1567.98, t: 0.50, d: 0.75 } // G6
      ];

      chordNotes.forEach(({ f, t, d }) => {
        const now = c.currentTime + t;
        const osc = c.createOscillator();
        const gain = c.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now);

        gain.gain.setValueAtTime(0.2 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001 * masterVol, now + d);

        osc.connect(gain).connect(c.destination);
        osc.start(now);
        osc.stop(now + d + 0.05);
      });
    } catch {
      // Audio context safe ignore
    }
  }

  /**
   * Somber defeat tone when Dealer matches the Point Card.
   */
  public playLossSting() {
    const masterVol = this.getMasterVolume();
    if (masterVol <= 0) return;
    const c = this.getContext();
    if (!c) return;

    try {
      const notes = [440, 415.3, 392.0, 329.6]; // A4 -> G#4 -> G4 -> E4
      notes.forEach((freq, idx) => {
        const now = c.currentTime + idx * 0.09;
        const osc = c.createOscillator();
        const gain = c.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.14 * masterVol, now);
        gain.gain.exponentialRampToValueAtTime(0.001 * masterVol, now + 0.35);

        osc.connect(gain).connect(c.destination);
        osc.start(now);
        osc.stop(now + 0.38);
      });
    } catch {
      // Audio context safe ignore
    }
  }
}

export const soundEngine = new SoundEngine();
