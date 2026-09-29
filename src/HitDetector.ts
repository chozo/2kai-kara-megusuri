import * as THREE from 'three';
import { CONFIG } from './config';
import type { TargetCharacter } from './TargetCharacter';

export type HitKind = 'success' | 'near' | 'blink' | 'face' | 'head' | 'body' | 'ground';

export interface HitResult {
  kind: HitKind;
  point: THREE.Vector3;
  /** 最寄りの目 (0 / 1) */
  eyeIndex: number;
  /** 最寄りの黒目中心までの距離 (m) */
  pupilDistance: number;
}

/**
 * 水滴の 1 ステップ分の移動線分 (prev → cur) に対して当たりを調べる。
 * 優先順：頭（→目の判定） > 体 > 地面
 */
export class HitDetector {
  private center = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private pupil = new THREE.Vector3();

  constructor(private target: TargetCharacter) {}

  check(prev: THREE.Vector3, cur: THREE.Vector3): HitResult | null {
    const t = this.target;
    const R = CONFIG.hit.headHitRadius + CONFIG.hit.dropletRadius;
    t.headCenterWorld(this.center);

    const s = segmentSphere(prev, cur, this.center, R);
    if (s !== null) {
      const contact = prev.clone().lerp(cur, s);
      // 頭表面上の点に投影
      const surface = this.tmp.copy(contact).sub(this.center).setLength(CONFIG.target.headRadius).add(this.center).clone();
      return this.classifyHeadHit(surface);
    }

    if (t.hitsBody(cur)) {
      return this.result('body', cur.clone());
    }

    if (cur.y <= 0) {
      const k = prev.y / (prev.y - cur.y);
      const p = prev.clone().lerp(cur, k);
      p.y = 0;
      return this.result('ground', p);
    }
    return null;
  }

  private classifyHeadHit(point: THREE.Vector3): HitResult {
    const res = this.result('face', point);
    const h = CONFIG.hit;
    if (res.pupilDistance <= h.eyeHitRadius) {
      if (this.target.isEyeClosed(res.eyeIndex)) res.kind = 'blink';
      else if (res.pupilDistance <= h.pupilHitRadius) res.kind = 'success';
      else res.kind = 'near';
      return res;
    }
    // 顔側か後頭部か
    const normal = point.clone().sub(this.target.headCenterWorld(this.center)).normalize();
    const face = this.target.faceNormalWorld();
    res.kind = normal.dot(face) > 0.25 ? 'face' : 'head';
    return res;
  }

  private result(kind: HitKind, point: THREE.Vector3): HitResult {
    let best = Infinity;
    let idx = 0;
    const center = this.target.headCenterWorld(new THREE.Vector3());
    for (let i = 0; i < 2; i++) {
      // 黒目を頭の表面へ投影した点との距離（顔の表面上の距離として扱う）
      this.target.pupilWorld(i, this.pupil).sub(center).setLength(CONFIG.target.headRadius).add(center);
      const d = this.pupil.distanceTo(point);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    return { kind, point, eyeIndex: idx, pupilDistance: best };
  }
}

/** 線分 a→b と球の最初の交点のパラメータ (0-1)。交差しなければ null */
function segmentSphere(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
  const d = b.clone().sub(a);
  const f = a.clone().sub(c);
  const A = d.dot(d);
  const B = 2 * f.dot(d);
  const C = f.dot(f) - r * r;
  if (C <= 0) return 0; // 開始時点で内側
  if (A === 0) return null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}
