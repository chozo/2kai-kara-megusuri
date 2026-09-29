import * as THREE from 'three';
import { CONFIG, overviewPose } from './config';
import type { Droplet } from './Droplet';
import type { TargetCharacter } from './TargetCharacter';

export type CameraMode = 'overview' | 'follow' | 'face' | 'ground' | 'celebrate';

interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** カメラの上方向（顔ズーム時は額の方向を画面上にする） */
  up?: THREE.Vector3;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * モードごとに「目標ポーズ」を毎フレーム計算し、
 * モード切替時は切替直前の実ポーズから目標ポーズへ補間する（瞬間移動しない）。
 */
export class CameraController {
  mode: CameraMode = 'overview';
  /** 顔ズームの寄り具合 (0 = 通常, 1 = 最大) */
  pushIn = 0;

  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: CONFIG.camera.fov, up: WORLD_UP.clone() };
  private current = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: CONFIG.camera.fov, up: WORLD_UP.clone() };
  private blend = 1;
  private blendDuration = 1;
  private time = 0;
  private groundAnchor = new THREE.Vector3();
  private celebrateStart = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private droplet: Droplet,
    private target: TargetCharacter,
  ) {
    const p = this.targetPose('overview');
    this.current.pos.copy(p.pos);
    this.current.look.copy(p.look);
    this.apply();
  }

  /** force: 同じモードでも目標が大きく変わったとき（レベル変更など）に補間し直す */
  setMode(mode: CameraMode, duration: number, force = false) {
    if (mode === this.mode && !force) return;
    this.from.pos.copy(this.current.pos);
    this.from.look.copy(this.current.look);
    this.from.fov = this.current.fov;
    this.from.up.copy(this.current.up);
    this.mode = mode;
    this.blend = 0;
    this.blendDuration = Math.max(duration, 0.0001);
    if (mode === 'ground') this.groundAnchor.copy(this.droplet.position);
    if (mode === 'celebrate') this.celebrateStart = this.time;
  }

  /** realDt: 実時間（スローモーションの影響を受けない） */
  update(realDt: number) {
    this.time += realDt;
    const goal = this.targetPose(this.mode);
    const goalUp = goal.up ?? WORLD_UP;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + realDt / this.blendDuration);
      const k = easeInOut(this.blend);
      this.current.pos.lerpVectors(this.from.pos, goal.pos, k);
      this.current.look.lerpVectors(this.from.look, goal.look, k);
      this.current.fov = THREE.MathUtils.lerp(this.from.fov, goal.fov, k);
      this.current.up.lerpVectors(this.from.up, goalUp, k).normalize();
    } else {
      this.current.pos.copy(goal.pos);
      this.current.look.copy(goal.look);
      this.current.fov = goal.fov;
      this.current.up.copy(goalUp);
    }
    this.apply();
  }

  private apply() {
    this.camera.position.copy(this.current.pos);
    this.camera.up.copy(this.current.up);
    this.camera.lookAt(this.current.look);
    if (Math.abs(this.camera.fov - this.current.fov) > 0.01) {
      this.camera.fov = this.current.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private targetPose(mode: CameraMode): Pose {
    const c = CONFIG.camera;
    const d = this.droplet.position;
    switch (mode) {
      case 'overview': {
        // ゆっくり揺れて空気感を出す
        const o = overviewPose();
        const sway = Math.sin(this.time * 0.4) * 0.12;
        return {
          pos: new THREE.Vector3(o.pos.x + sway, o.pos.y, o.pos.z),
          look: new THREE.Vector3(o.look.x, o.look.y, o.look.z),
          fov: c.fov,
        };
      }
      case 'follow': {
        return {
          pos: d.clone().add(new THREE.Vector3(c.followOffset.x, c.followOffset.y, c.followOffset.z)),
          look: d.clone().add(new THREE.Vector3(c.followLookOffset.x, c.followLookOffset.y, c.followLookOffset.z)),
          fov: 62,
        };
      }
      case 'face': {
        const eyes = this.target.eyesMidWorld();
        const n = this.target.faceNormalWorld();
        const forehead = this.target.foreheadDirWorld();
        const dist = c.faceCamDistance * (1 - this.pushIn * 0.4);
        // 顔の真上・あご側からのぞき込む。額が画面上になり、水滴は画面上方から目へ向かってくる
        const pos = eyes
          .clone()
          .addScaledVector(n, dist)
          .addScaledVector(forehead, -dist * 0.38)
          .add(new THREE.Vector3(dist * 0.12, 0, 0));
        // 水滴を常に画面内に入れつつ、近づくほど注視点を顔へ寄せる
        const h = THREE.MathUtils.clamp((d.y - eyes.y) / c.faceZoomStartHeight, 0, 1);
        const look = eyes.clone().lerp(d, this.droplet.active ? 0.3 + h * 0.3 : 0);
        return { pos, look, fov: 44 - this.pushIn * 6, up: forehead };
      }
      case 'celebrate': {
        // 人物の斜め上から、建物にめり込まない範囲で左右にゆっくり振る。少しずつ引いて上がる
        const t = this.time - this.celebrateStart;
        const base = this.target.group.position;
        const a = Math.PI / 2 + Math.sin(t * 0.6) * 0.45;
        const grow = Math.min(t, 4);
        const r = 4.0 + grow * 0.15;
        // 注視点を人物の頭より上に置き、全身が文字の下（画面下半分）に収まるようにする
        return {
          pos: new THREE.Vector3(base.x + Math.sin(a) * r, 2.4 + grow * 0.1, base.z + Math.cos(a) * r),
          look: new THREE.Vector3(base.x, 2.25, base.z - 0.2),
          fov: 55,
        };
      }
      case 'ground': {
        const a = this.groundAnchor;
        const y = Math.max(d.y, 0);
        return {
          pos: new THREE.Vector3(a.x + 1.1, y + 1.3, a.z + 2.0),
          look: new THREE.Vector3(d.x, y, d.z),
          fov: 55,
        };
      }
    }
  }
}
