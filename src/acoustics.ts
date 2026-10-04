// Synthesised multirotor sound. Level and pitch are pure functions of range and motion; the
// Web Audio engine only renders them, so the cue follows the exercise clock like everything else.

/** Relative loudness (0–1) of one multirotor at a slant range in metres: full within 5 m, faint by 400 m. */
export function rotorLevel(range: number) {
  if (!Number.isFinite(range)) return 0;
  return Math.min(1, Math.max(0, 1 - Math.log10(Math.max(range, 5)/5)/Math.log10(80)));
}
/** Combined loudness of several airframes (energy sum), capped at 1. */
export const combinedLevel = (levels: number[]) => Math.min(1, Math.sqrt(levels.reduce((sum, level) => sum + level*level, 0)));
/** Blade-pass fundamental in Hz: about 200 Hz in hover, rising as the motors work harder. */
export const bladePass = (speed: number, forwardAccel: number) => 190 + Math.min(70, speed*6 + Math.max(0, forwardAccel)*4);

export class RotorAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private noise: AudioBufferSourceNode | null = null;

  private build() {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    const context = new Context(), master = context.createGain(), tone = context.createBiquadFilter();
    master.gain.value = 0; tone.type = 'lowpass'; tone.frequency.value = 1700; tone.Q.value = .4;
    tone.connect(master); master.connect(context.destination);
    // Four slightly detuned motors beat against each other, as real multirotors do.
    for (const [detune, type, gain] of [[0, 'sawtooth', .22], [1.013, 'sawtooth', .2], [.987, 'sawtooth', .18], [2.01, 'square', .05]] as const) {
      const osc = context.createOscillator(), level = context.createGain();
      osc.type = type; osc.frequency.value = 200*(detune || 1); level.gain.value = gain;
      osc.connect(level).connect(tone); osc.start(); this.oscillators.push(osc);
    }
    const buffer = context.createBuffer(1, context.sampleRate*2, context.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random()*2 - 1; // Broadband wash; not part of the simulation state.
    const noise = context.createBufferSource(), band = context.createBiquadFilter(), noiseLevel = context.createGain();
    noise.buffer = buffer; noise.loop = true; band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = .6; noiseLevel.gain.value = .35;
    noise.connect(band).connect(noiseLevel).connect(master); noise.start(); this.noise = noise;
    this.context = context; this.master = master;
    return context;
  }
  /** Sets loudness (0–1) and blade-pass pitch. Creates the audio graph on first audible use. */
  update(level: number, frequency: number) {
    if (!this.context && level <= 0) return;
    const context = this.context ?? this.build();
    if (!context || !this.master) return;
    if (context.state === 'suspended' && level > 0) void context.resume().catch(() => undefined);
    const now = context.currentTime;
    this.master.gain.setTargetAtTime(level*.16, now, .08);
    this.oscillators.forEach((osc, i) => osc.frequency.setTargetAtTime(frequency*[1, 1.013, .987, 2.01][i], now, .15));
  }
  silence() { if (this.context && this.master) this.master.gain.setTargetAtTime(0, this.context.currentTime, .05); }
  dispose() {
    this.oscillators.forEach(osc => osc.stop()); this.noise?.stop();
    void this.context?.close().catch(() => undefined);
    this.context = null; this.master = null; this.oscillators = []; this.noise = null;
  }
}
