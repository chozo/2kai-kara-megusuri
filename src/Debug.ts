import * as THREE from 'three';
import { CONFIG } from './config';
import type { Droplet } from './Droplet';
import type { TargetCharacter } from './TargetCharacter';
import type { Wind } from './Wind';
import type { Player } from './Player';

const MAX_TRAIL = 2000;

/** デバッグ表示（軌跡・当たり判定・風ベクトル・予測軌道）。FPS等の文字情報は text() で返す */
export class Debug {
  readonly group = new THREE.Group();
  visible = false;

  private trailGeo = new THREE.BufferGeometry();
  private predictGeo = new THREE.BufferGeometry();
  private pupilSpheres: THREE.Mesh[] = [];
  private eyeSpheres: THREE.Mesh[] = [];
  private headSphere: THREE.Mesh;
  private windArrow: THREE.ArrowHelper;
  private fps = 60;
  private frames = 0;
  private acc = 0;

  constructor(
    private droplet: Droplet,
    private target: TargetCharacter,
    private wind: Wind,
    private player: Player,
  ) {
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    const trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({ color: 0xff2266, depthTest: false }));
    trail.frustumCulled = false;
    trail.renderOrder = 999;

    this.predictGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_TRAIL * 3), 3));
    const predict = new THREE.Line(
      this.predictGeo,
      new THREE.LineDashedMaterial({ color: 0x00ffcc, dashSize: 0.05, gapSize: 0.04, depthTest: false }),
    );
    predict.frustumCulled = false;
    predict.renderOrder = 998;
    this.group.add(trail, predict);

    const wire = (color: number, r: number) =>
      new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 10),
        new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.7, depthTest: false }),
      );
    for (let i = 0; i < 2; i++) {
      const p = wire(0x00ff44, CONFIG.hit.pupilHitRadius);
      const e = wire(0xffcc00, CONFIG.hit.eyeHitRadius);
      this.pupilSpheres.push(p);
      this.eyeSpheres.push(e);
      this.group.add(p, e);
    }
    this.headSphere = wire(0x4488ff, CONFIG.hit.headHitRadius);
    (this.headSphere.material as THREE.MeshBasicMaterial).opacity = 0.25;
    this.group.add(this.headSphere);

    this.windArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, 0x00aaff, 0.2, 0.1);
    this.group.add(this.windArrow);
    this.group.visible = false;
  }

  /** レベル変更でプレイヤーを作り直したとき */
  setPlayer(p: Player) {
    this.player = p;
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.group.visible = v;
  }

  update(realDt: number) {
    this.frames++;
    this.acc += realDt;
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
    }
    if (!this.visible) return;

    // 軌跡
    const pts = this.droplet.trail;
    const arr = this.trailGeo.attributes.position.array as Float32Array;
    const n = Math.min(pts.length, MAX_TRAIL);
    for (let i = 0; i < n; i++) pts[i].toArray(arr, i * 3);
    if (n > 0 && this.droplet.active) {
      this.droplet.position.toArray(arr, n * 3);
    }
    this.trailGeo.setDrawRange(0, n + (this.droplet.active ? 1 : 0));
    this.trailGeo.attributes.position.needsUpdate = true;

    // 当たり判定（黒目・目は頭表面へ投影した位置）
    const center = this.target.headCenterWorld();
    const R = CONFIG.target.headRadius;
    for (let i = 0; i < 2; i++) {
      const p = this.target.pupilWorld(i).sub(center).setLength(R).add(center);
      this.pupilSpheres[i].position.copy(p);
      this.eyeSpheres[i].position.copy(p);
      const closed = this.target.isEyeClosed(i);
      (this.pupilSpheres[i].material as THREE.MeshBasicMaterial).color.set(closed ? 0xff0000 : 0x00ff44);
    }
    this.headSphere.position.copy(center);

    // 風ベクトル（ノズル位置から）
    this.windArrow.position.copy(this.player.nozzle).add(new THREE.Vector3(0, 0.3, 0));
    this.windArrow.setDirection(this.wind.direction);
    this.windArrow.setLength(0.2 + this.wind.speed * 0.25, 0.15, 0.08);
  }

  /** 現在のノズル位置から落とした場合の予測軌道（デバッグ専用。通常プレイでは非表示） */
  updatePrediction(windAccel: THREE.Vector3) {
    const arr = this.predictGeo.attributes.position.array as Float32Array;
    const p = this.player.nozzle.clone();
    p.y -= CONFIG.droplet.visualRadius;
    const v = new THREE.Vector3(CONFIG.physics.initialVelocity.x, CONFIG.physics.initialVelocity.y, CONFIG.physics.initialVelocity.z);
    const h = 1 / 60;
    let i = 0;
    while (p.y > 0 && i < MAX_TRAIL) {
      p.toArray(arr, i * 3);
      i++;
      v.y -= CONFIG.physics.gravity * h;
      v.x += windAccel.x * h;
      v.z += windAccel.z * h;
      p.addScaledVector(v, h);
    }
    this.predictGeo.setDrawRange(0, i);
    this.predictGeo.attributes.position.needsUpdate = true;
    const line = this.group.children[1] as THREE.Line;
    line.computeLineDistances();
  }

  text(state: string, timeScale: number): string {
    const d = this.droplet.position;
    const w = this.wind;
    const n = this.player.nozzle;
    return [
      `FPS      ${this.fps.toFixed(0)}`,
      `STATE    ${state}  x${timeScale.toFixed(2)}`,
      `WIND     ${w.speed.toFixed(1)} m/s  dir(${w.direction.x.toFixed(2)}, ${w.direction.z.toFixed(2)})`,
      `NOZZLE   ${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}`,
      `DROP     ${d.x.toFixed(3)}, ${d.y.toFixed(3)}, ${d.z.toFixed(3)}`,
      `VEL      ${this.droplet.velocity.length().toFixed(2)} m/s`,
      `EYES     L:${this.target.isEyeClosed(0) ? 'CLOSED' : 'open'} R:${this.target.isEyeClosed(1) ? 'CLOSED' : 'open'}`,
    ].join('\n');
  }
}
