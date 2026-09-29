import { CONFIG } from './config';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// BGM：C - Am - F - G の 4 小節ループ（8分音符 × 32 ステップ）。null は休符
const CHORD_ROOTS = [48, 45, 41, 43]; // C3 A2 F2 G2
const MELODY: (number | null)[] = [
  72, null, 76, 79, 76, null, 74, 72,
  69, null, 72, 76, 74, null, 72, null,
  69, 72, 74, null, 77, 76, 74, 72,
  71, null, 74, 79, 77, 76, 74, null,
];

/**
 * BGM と効果音。音声ファイルは使わず Web Audio API で合成する。
 * ブラウザの自動再生制限があるため、最初のユーザー操作で unlock() してから鳴らす。
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bgmGain!: GainNode;
  private sfxGain!: GainNode;
  private noise!: AudioBuffer;
  private windGain: GainNode | null = null;
  private whoosh: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private bgmTimer = 0;
  private bgmStep = 0;
  private bgmNext = 0;
  bgmPlaying = false;
  /** 起動時は常に BGM あり（ミュートは保存しない） */
  muted = false;

  /** ユーザー操作の中で呼ぶ。初回だけ AudioContext を作る */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : CONFIG.audio.master;
      this.master.connect(this.ctx.destination);
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = CONFIG.audio.bgm;
      this.bgmGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = CONFIG.audio.sfx;
      this.sfxGain.connect(this.master);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready() {
    return this.ctx !== null;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : CONFIG.audio.master, this.ctx.currentTime, 0.03);
  }

  // ------------------------------------------------------------------ BGM

  startBgm() {
    if (!this.ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;
    this.bgmStep = 0;
    this.bgmNext = this.ctx.currentTime + 0.1;
    this.bgmTimer = window.setInterval(() => this.scheduleBgm(), 30);
  }

  stopBgm() {
    this.bgmPlaying = false;
    clearInterval(this.bgmTimer);
  }

  /** 落下中などは BGM を下げて効果音を目立たせる */
  duckBgm(on: boolean) {
    if (!this.ctx) return;
    this.bgmGain.gain.setTargetAtTime(on ? CONFIG.audio.bgm * 0.25 : CONFIG.audio.bgm, this.ctx.currentTime, 0.15);
  }

  private scheduleBgm() {
    const ctx = this.ctx!;
    const stepDur = 60 / CONFIG.audio.bgmTempo / 2;
    // タブが裏に回って遅れた場合は追いつかせず、今から再開する
    if (this.bgmNext < ctx.currentTime - 0.2) this.bgmNext = ctx.currentTime + 0.05;
    while (this.bgmNext < ctx.currentTime + 0.15) {
      const s = this.bgmStep;
      const t = this.bgmNext;
      const bar = Math.floor(s / 8);
      const root = CHORD_ROOTS[bar];
      // ベース（4分音符、裏でオクターブ）
      if (s % 2 === 0) {
        const n = s % 4 === 0 ? root : root + 12;
        this.tone(midi(n), t, stepDur * 1.8, 'triangle', 0.5, this.bgmGain);
      }
      // メロディ
      const m = MELODY[s];
      if (m !== null) this.tone(midi(m), t, stepDur * 0.9, 'square', 0.12, this.bgmGain, 0.01);
      // 小節頭にやわらかい和音
      if (s % 8 === 0) {
        for (const iv of bar === 1 ? [0, 3, 7] : [0, 4, 7]) {
          this.tone(midi(root + 24 + iv), t, stepDur * 7, 'sine', 0.08, this.bgmGain, 0.05);
        }
      }
      // 裏拍のハイハット
      if (s % 2 === 1) this.noiseBurst(t, 0.03, 7000, 'highpass', 0.12, this.bgmGain);
      this.bgmStep = (s + 1) % MELODY.length;
      this.bgmNext += stepDur;
    }
  }

  // ------------------------------------------------------------------ 環境音

  /** 風の音。風速に応じて音量を変える */
  setWind(speed: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.windGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 450;
      filter.Q.value = 0.8;
      // ゆっくり揺らして「ひゅう」という感じを出す
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.25;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 200;
      lfo.connect(lfoGain).connect(filter.frequency);
      lfo.start();
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      src.connect(filter).connect(this.windGain).connect(this.sfxGain);
      src.start();
    }
    this.windGain.gain.setTargetAtTime(0.03 + speed * 0.035, ctx.currentTime, 0.4);
  }

  // ------------------------------------------------------------------ 効果音

  /** UI ボタン */
  tap() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(1200, t, 0.06, 'sine', 0.25, this.sfxGain, 0.002, 1600);
  }

  /** 目薬を押す「きゅっ」 */
  squeeze() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(500, t, 0.12, 'triangle', 0.25, this.sfxGain, 0.005, 900);
  }

  /** 滴が離れる「ぽつっ」+ 落下の風切り音 */
  release(fallTime: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.tone(1400, t, 0.08, 'sine', 0.35, this.sfxGain, 0.002, 700);

    this.stopWhoosh();
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + fallTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + fallTime * 0.7);
    src.connect(filter).connect(gain).connect(this.sfxGain);
    src.start(t);
    this.whoosh = { src, gain };
  }

  /** 顔に近づいてスローになった瞬間の「キーン」 */
  slowMo() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.9, 'sine', 0.12, this.sfxGain, 0.05, 1320);
    if (this.whoosh) this.whoosh.gain.gain.setTargetAtTime(0.12, t, 0.1);
  }

  stopWhoosh() {
    if (!this.ctx || !this.whoosh) return;
    const { src, gain } = this.whoosh;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.03);
    src.stop(t + 0.2);
    this.whoosh = null;
  }

  /** 目に入った「ぽちゃん」 */
  plop() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(350, t, 0.12, 'sine', 0.6, this.sfxGain, 0.002, 1300);
    this.tone(900, t + 0.09, 0.18, 'sine', 0.35, this.sfxGain, 0.002, 1800);
  }

  /** 成功ファンファーレ */
  fanfare() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    const notes = [72, 76, 79, 84];
    notes.forEach((n, i) => this.tone(midi(n), t + i * 0.09, 0.16, 'square', 0.18, this.sfxGain, 0.005));
    const end = t + notes.length * 0.09;
    for (const n of [72, 76, 79, 84]) this.tone(midi(n), end, 0.9, 'triangle', 0.22, this.sfxGain, 0.01);
    this.tone(midi(88), end, 0.9, 'square', 0.1, this.sfxGain, 0.01);
    // キラキラ
    for (let i = 0; i < 8; i++) this.tone(midi(96 + ((i * 5) % 12)), end + 0.1 + i * 0.06, 0.12, 'sine', 0.08, this.sfxGain, 0.002);
  }

  /** オールクリアの長いファンファーレ（約 3 秒） */
  allClear() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.05;
    const beat = 0.14;
    // 「ぱっぱらっぱっぱー、ぱぱぱぱーん」
    const melody: [number | null, number][] = [
      [67, 1], [67, 1], [67, 1], [72, 3], [null, 1],
      [70, 1], [72, 1], [74, 1], [76, 2], [74, 1], [76, 6],
    ];
    let t = t0;
    for (const [n, len] of melody) {
      if (n !== null) {
        this.tone(midi(n), t, beat * len * 0.95, 'square', 0.16, this.sfxGain, 0.005);
        this.tone(midi(n + 12), t, beat * len * 0.95, 'triangle', 0.1, this.sfxGain, 0.005);
      }
      t += beat * len;
    }
    // ベースと和音
    const chords: [number, number[]][] = [
      [48, [60, 64, 67]], [46, [58, 62, 65]], [48, [60, 64, 67, 72]],
    ];
    const chordTimes = [t0 + beat * 3, t0 + beat * 7, t0 + beat * 12];
    chords.forEach(([bass, notes], i) => {
      const ct = chordTimes[i];
      const len = i === 2 ? 1.8 : beat * 4;
      this.tone(midi(bass), ct, len, 'triangle', 0.45, this.sfxGain, 0.01);
      for (const n of notes) this.tone(midi(n), ct, len, 'sawtooth', 0.04, this.sfxGain, 0.02);
    });
    // 最後のキラキラ上昇アルペジオ
    const end = t0 + beat * 12;
    for (let i = 0; i < 14; i++) {
      this.tone(midi(84 + [0, 4, 7, 12][i % 4]), end + i * 0.05, 0.18, 'sine', 0.09, this.sfxGain, 0.002);
    }
    // シンバル風
    this.noiseBurst(end, 1.6, 6000, 'highpass', 0.35, this.sfxGain);
  }

  /** 花火の「ドン…パチパチ」 */
  firework() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(90, t, 0.35, 'sine', 0.5, this.sfxGain, 0.003, 40);
    this.noiseBurst(t, 0.25, 900, 'lowpass', 0.5, this.sfxGain);
    for (let i = 0; i < 5; i++) {
      this.noiseBurst(t + 0.15 + Math.random() * 0.5, 0.04, 5000 + Math.random() * 3000, 'highpass', 0.18, this.sfxGain);
    }
  }

  /** 肌やまぶたに当たった「ぺちっ」 */
  splat() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.09, 1800, 'bandpass', 0.7, this.sfxGain);
    this.tone(220, t, 0.1, 'sine', 0.3, this.sfxGain, 0.002, 120);
  }

  /** 地面に落ちた「ぴちゃっ」 */
  groundSplash() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, 0.18, 2500, 'bandpass', 0.6, this.sfxGain);
    this.noiseBurst(t + 0.04, 0.12, 5000, 'highpass', 0.25, this.sfxGain);
  }

  /** 惜しい：下がる 2 音 */
  near() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    this.tone(midi(76), t, 0.2, 'triangle', 0.3, this.sfxGain, 0.005);
    this.tone(midi(71), t + 0.2, 0.4, 'triangle', 0.3, this.sfxGain, 0.005, midi(69));
  }

  /** 外れ：ゆるい「ぶっぶー」 */
  miss() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    this.tone(180, t, 0.16, 'sawtooth', 0.12, this.sfxGain, 0.005);
    this.tone(150, t + 0.2, 0.3, 'sawtooth', 0.12, this.sfxGain, 0.005);
  }

  // ------------------------------------------------------------------ 合成の部品

  private tone(
    freq: number,
    start: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest: AudioNode,
    attack = 0.005,
    endFreq?: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private noiseBurst(start: number, dur: number, freq: number, type: BiquadFilterType, vol: number, dest: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
