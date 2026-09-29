interface Piece {
  /** paper = 紙吹雪、spark = 花火の火花 */
  kind: 'paper' | 'spark';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  flip: number;
  vflip: number;
  w: number;
  h: number;
  color: string;
  life: number;
  maxLife: number;
}

const COLORS = ['#ff4d6d', '#ffd23f', '#3ec1ff', '#5ee27a', '#b36bff', '#ff9f1c', '#ffffff'];

/**
 * 成功時の紙吹雪。カメラ位置に関係なく必ず見えるよう、画面上の 2D Canvas に描く。
 */
export class Confetti {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private pieces: Piece[] = [];
  private running = false;
  private last = 0;
  private timers: number[] = [];
  /** 花火が開いた瞬間（効果音用） */
  onFirework: () => void = () => {};

  constructor(private container: HTMLElement) {
    this.canvas.id = 'confetti';
    container.appendChild(this.canvas);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.max(1, Math.round(this.container.clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(this.container.clientHeight * dpr));
  }

  /** 左右下から打ち上げ + 上から降らせる */
  burst(power = 1) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = (H / 800) * Math.sqrt(power); // 画面サイズに比例
    for (const side of [-1, 1]) {
      for (let i = 0; i < 70 * power; i++) {
        const angle = (-90 + side * (-12 - Math.random() * 28)) * (Math.PI / 180);
        const speed = (650 + Math.random() * 500) * s;
        this.pieces.push(this.makePiece(side < 0 ? 0 : W, H * 0.92, Math.cos(angle) * speed, Math.sin(angle) * speed, s));
      }
    }
    for (let i = 0; i < 90; i++) {
      this.pieces.push(this.makePiece(Math.random() * W, -Math.random() * H * 0.5, (Math.random() - 0.5) * 120 * s, 60 * s, s));
    }
    this.ensureRunning();
  }

  /**
   * オールクリア用：紙吹雪を何度も打ち上げ、花火を連発する
   * @param duration 演出の長さ (s)
   */
  celebrate(duration = 4) {
    const at = (sec: number, fn: () => void) => this.timers.push(window.setTimeout(fn, sec * 1000));
    for (const t of [0, 0.7, 1.5, 2.4, 3.4]) if (t < duration) at(t, () => this.burst(1.4));
    for (let t = 0.2; t < duration; t += 0.32 + Math.random() * 0.2) {
      at(t, () => this.firework());
    }
    // 上から降り続ける紙吹雪
    for (let t = 0.5; t < duration + 1.5; t += 0.25) at(t, () => this.rain(12));
  }

  /** 画面上部のランダムな位置で花火を開く */
  firework() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = H / 800;
    const x = W * (0.15 + Math.random() * 0.7);
    const y = H * (0.1 + Math.random() * 0.4);
    const color = COLORS[Math.floor(Math.random() * (COLORS.length - 1))];
    const n = 70;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      const speed = (260 + Math.random() * 220) * s;
      const p = this.makePiece(x, y, Math.cos(a) * speed, Math.sin(a) * speed, s);
      p.kind = 'spark';
      p.color = Math.random() < 0.2 ? '#ffffff' : color;
      p.w = p.h = (3 + Math.random() * 2.5) * s;
      p.life = p.maxLife = 1.1 + Math.random() * 0.5;
      this.pieces.push(p);
    }
    this.onFirework();
    this.ensureRunning();
  }

  private rain(count: number) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const s = H / 800;
    for (let i = 0; i < count; i++) {
      this.pieces.push(this.makePiece(Math.random() * W, -20 * s, (Math.random() - 0.5) * 120 * s, 80 * s, s));
    }
    this.ensureRunning();
  }

  private ensureRunning() {
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.tick);
    }
  }

  clear() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.length = 0;
    this.pieces.length = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private makePiece(x: number, y: number, vx: number, vy: number, s: number): Piece {
    return {
      kind: 'paper',
      x,
      y,
      vx,
      vy,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 12,
      flip: Math.random() * Math.PI * 2,
      vflip: 6 + Math.random() * 10,
      w: (7 + Math.random() * 7) * s,
      h: (11 + Math.random() * 9) * s,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 3.5 + Math.random() * 1.5,
      maxLife: 5,
    };
  }

  private tick = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    const { width: W, height: H } = this.canvas;
    const g = H * 0.9;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      p.life -= dt;
      if (p.kind === 'spark') {
        // 火花：放射状に広がって減速し、少し垂れて消える
        p.vx *= Math.pow(0.12, dt);
        p.vy = p.vy * Math.pow(0.12, dt) + g * dt * 0.12;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) {
          this.pieces.splice(i, 1);
          continue;
        }
        const k = p.life / p.maxLife;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, k * 1.5) * (0.7 + Math.random() * 0.3);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w * (0.6 + k * 0.6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      // 空気抵抗でひらひら落ちる
      p.vx *= Math.pow(0.35, dt);
      p.vy = p.vy * Math.pow(0.35, dt) + g * dt * 0.35;
      p.x += (p.vx + Math.sin(p.flip) * 40) * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.flip += p.vflip * dt;
      if (p.life <= 0 || p.y > H + 40) {
        this.pieces.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (this.pieces.length > 0) requestAnimationFrame(this.tick);
    else this.running = false;
  };
}
