import { CONFIG } from './config';

/**
 * ドラッグ（タッチ / マウス）とキーボードで、目薬の位置を相対移動させる。
 * 横ドラッグ = 左右 (X)、縦ドラッグ = 奥行き (Z：下へドラッグで手前 = 身を乗り出す)
 */
export class InputController {
  enabled = true;
  onMove: (dx: number, dz: number) => void = () => {};
  onDrop: () => void = () => {};
  onToggleDebug: () => void = () => {};
  onFirstMove: () => void = () => {};

  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private keys = new Set<string>();
  private moved = false;

  constructor(area: HTMLElement) {
    area.addEventListener('pointerdown', (e) => {
      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      try {
        area.setPointerCapture(e.pointerId);
      } catch {
        // 合成イベントなどでキャプチャできなくてもドラッグ自体は続行する
      }
    });
    area.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId || !this.enabled) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      // 画面サイズによらず同じ感覚になるよう、高さ 800px 基準で正規化
      const k = CONFIG.player.dragSensitivity * (800 / Math.max(area.clientHeight, 1));
      this.emitMove(dx * k, dy * k);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.pointerId) this.pointerId = null;
    };
    area.addEventListener('pointerup', end);
    area.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!e.repeat) this.onDrop();
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        this.onToggleDebug();
        return;
      }
      this.keys.add(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private emitMove(dx: number, dz: number) {
    if (!this.moved && (dx !== 0 || dz !== 0)) {
      this.moved = true;
      this.onFirstMove();
    }
    this.onMove(dx, dz);
  }

  /** キーボードの押しっぱなし移動 */
  update(dt: number) {
    if (!this.enabled) return;
    const s = CONFIG.player.keySpeed * dt;
    let dx = 0;
    let dz = 0;
    if (this.keys.has('ArrowLeft')) dx -= s;
    if (this.keys.has('ArrowRight')) dx += s;
    if (this.keys.has('ArrowUp')) dz -= s;
    if (this.keys.has('ArrowDown')) dz += s;
    if (dx || dz) this.emitMove(dx, dz);
  }
}
