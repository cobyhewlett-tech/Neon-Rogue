import { AudioSettings } from '../types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private isMusicPlaying = false;
  private musicTimer: number | null = null;
  private currentStep = 0;
  private isBossMusic = false;
  private noiseBuffer: AudioBuffer | null = null;

  public settings: AudioSettings = {
    masterVolume: 0.8,
    sfxVolume: 0.8,
    musicVolume: 0.6,
    muted: false,
  };

  constructor() {
    // Lazy init on first user interaction
  }

  public init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.updateVolumes();
      this.generateNoiseBuffer();
    } catch (e) {
      console.warn('Web Audio API not supported or blocked:', e);
    }
  }

  private generateNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public updateVolumes(settings?: Partial<AudioSettings>) {
    if (settings) {
      this.settings = { ...this.settings, ...settings };
    }
    if (!this.ctx || !this.masterGain || !this.sfxGain || !this.musicGain) return;

    const effectiveMaster = this.settings.muted ? 0 : this.settings.masterVolume;
    this.masterGain.gain.setValueAtTime(effectiveMaster, this.ctx.currentTime);
    this.sfxGain.gain.setValueAtTime(this.settings.sfxVolume, this.ctx.currentTime);
    this.musicGain.gain.setValueAtTime(this.settings.musicVolume, this.ctx.currentTime);
  }

  public playLaser(pitch = 1.0) {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(120 * pitch, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playMissile() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playExplosion(size = 1.0) {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(size > 1.5 ? 400 : 800, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + 0.3 * size);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.4 * size, 0.6), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35 * size);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.start(now);
    source.stop(now + 0.36 * size);
  }

  public playSmallExplosion() {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(3, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.start(now);
    source.stop(now + 0.09);
  }

  public playXpPickup(pitchStep = 0) {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C5, D5, E5, G5, A5, C6
    const baseFreq = notes[pitchStep % notes.length];

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playDash() {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.1);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.2);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    source.start(now);
    source.stop(now + 0.23);
  }

  public playPlayerHit() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.2);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.21);
  }

  public playShieldHit() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playLevelUp() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const freqs = [440, 554.37, 659.25, 880, 1108.73]; // A major fanfare
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(startTime);
      osc.stop(startTime + 0.36);
    });
  }

  public playBossWarning() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const startTime = now + i * 0.35;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, startTime);
      osc.frequency.setValueAtTime(180, startTime + 0.15);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(startTime);
      osc.stop(startTime + 0.32);
    }
  }

  public playEmpNova() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.5);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.56);
  }

  public playLightningArc() {
    if (!this.ctx || !this.sfxGain || this.settings.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.linearRampToValueAtTime(300, now + 0.06);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Synthwave procedural music loop
  public startMusic(isBoss = false) {
    this.isBossMusic = isBoss;
    if (this.isMusicPlaying) return;
    this.init();
    this.isMusicPlaying = true;
    this.currentStep = 0;

    const tempo = isBoss ? 138 : 124;
    const stepInterval = (60 / tempo / 4) * 1000; // 16th notes

    this.musicTimer = window.setInterval(() => {
      this.tickMusicStep();
    }, stepInterval);
  }

  public setBossMusic(isBoss: boolean) {
    if (this.isBossMusic === isBoss) return;
    this.isBossMusic = isBoss;
    this.stopMusic();
    this.startMusic(isBoss);
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private tickMusicStep() {
    if (!this.ctx || !this.musicGain || this.settings.muted || this.settings.musicVolume <= 0) {
      this.currentStep = (this.currentStep + 1) % 32;
      return;
    }

    const now = this.ctx.currentTime;
    const step = this.currentStep;

    // Bassline (d minor scale / cyberpunk groove)
    // Root notes: D2 (73.42Hz), F2 (87.31Hz), G2 (98.00Hz), Bb2 (116.54Hz), C3 (130.81Hz)
    const bassPatterns = this.isBossMusic
      ? [73.42, 73.42, 116.54, 73.42, 98.0, 73.42, 130.81, 146.83]
      : [73.42, 0, 73.42, 73.42, 87.31, 73.42, 98.0, 0];

    const bassFreq = bassPatterns[step % bassPatterns.length];
    if (bassFreq > 0) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bassFreq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(this.isBossMusic ? 900 : 500, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + 0.13);
    }

    // Drum kick (on beats 0, 4, 8, 12, 16, 20, 24, 28)
    if (step % 4 === 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + 0.09);
    }

    // Snare / Hi-hat
    if (step % 8 === 4 && this.noiseBuffer) {
      // Snare
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1000, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      source.start(now);
      source.stop(now + 0.11);
    } else if (step % 2 === 0 && this.noiseBuffer) {
      // Hi-hat
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(6000, now);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.musicGain);

      source.start(now);
      source.stop(now + 0.04);
    }

    // Lead Arpeggio notes (D Minor Pentatonic: D4, F4, G4, A4, C5, D5)
    const arpNotes = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33];
    if (step % 2 === 1) {
      const noteIdx = (step * 3 + (this.isBossMusic ? 4 : 0)) % arpNotes.length;
      const freq = arpNotes[noteIdx];

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(now);
      osc.stop(now + 0.09);
    }

    this.currentStep = (this.currentStep + 1) % 32;
  }
}

export const soundEngine = new SoundEngine();
