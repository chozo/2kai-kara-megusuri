import * as THREE from 'three';
import { CONFIG } from './config';

/** 一定の風。命中したら Game が randomize() で生成し直す（外している間は同じ風） */
export class Wind {
  /** 水平方向の単位ベクトル (y = 0) */
  readonly direction = new THREE.Vector3(1, 0, 0);
  /** 表示用風速 (m/s) */
  speed = 0;

  randomize() {
    const l = CONFIG.level;
    this.speed = Math.round(THREE.MathUtils.randFloat(l.windMin, l.windMax) * 10) / 10;
    const sign = Math.random() < 0.5 ? -1 : 1;
    const a = THREE.MathUtils.degToRad(THREE.MathUtils.randFloatSpread(2 * l.windMaxDepthAngleDeg));
    this.direction.set(sign * Math.cos(a), 0, Math.sin(a)).normalize();
  }

  /** 水滴に掛かる加速度 (m/s^2) */
  acceleration(target = new THREE.Vector3()) {
    return target.copy(this.direction).multiplyScalar(this.speed * CONFIG.physics.windAccelPerMps);
  }
}

const STREAKS = 140;
const AREA = { minX: -9, maxX: 9, minY: 0.3, maxY: 8, minZ: -0.5, maxZ: 9 };
const MAX_Y_ABOVE_HAND = 3;

/** 風を目で見せる演出：流れる筋・旗・雲 */
export class WindVisuals {
  readonly group = new THREE.Group();
  private streakPos: Float32Array;
  private streakGeo: THREE.BufferGeometry;
  private seeds: THREE.Vector3[] = [];
  private flag: THREE.Mesh;
  private flagPivot = new THREE.Group();
  private flagBase: Float32Array;
  private clouds: THREE.Group[] = [];
  private time = 0;

  constructor(private wind: Wind) {
    // 風の筋
    this.streakPos = new Float32Array(STREAKS * 6);
    this.streakGeo = new THREE.BufferGeometry();
    this.streakGeo.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    for (let i = 0; i < STREAKS; i++) {
      this.seeds.push(
        new THREE.Vector3(
          THREE.MathUtils.randFloat(AREA.minX, AREA.maxX),
          THREE.MathUtils.randFloat(AREA.minY, AREA.maxY),
          THREE.MathUtils.randFloat(AREA.minZ, AREA.maxZ),
        ),
      );
    }
    const streaks = new THREE.LineSegments(
      this.streakGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    streaks.frustumCulled = false;
    this.group.add(streaks);

    // 旗
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 2.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.6, roughness: 0.3 }),
    );
    pole.position.set(-2.4, 1.3, 3.6);
    pole.castShadow = true;
    this.group.add(pole);
    const flagGeo = new THREE.PlaneGeometry(0.8, 0.5, 16, 6);
    flagGeo.translate(0.4, -0.25, 0);
    this.flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array);
    this.flag = new THREE.Mesh(
      flagGeo,
      new THREE.MeshStandardMaterial({ color: 0xff6a3d, side: THREE.DoubleSide, roughness: 0.8 }),
    );
    this.flag.castShadow = true;
    this.flagPivot.position.set(-2.4, 2.58, 3.6);
    this.flagPivot.add(this.flag);
    this.group.add(this.flagPivot);

    // 雲
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < n; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(THREE.MathUtils.randFloat(1.2, 2.2), 12, 10), cloudMat);
        s.position.set(j * 1.6 - n * 0.8, Math.random() * 0.6, Math.random() * 0.8);
        s.scale.y = 0.6;
        c.add(s);
      }
      c.position.set(THREE.MathUtils.randFloat(-40, 40), THREE.MathUtils.randFloat(16, 26), THREE.MathUtils.randFloat(-50, -20));
      this.clouds.push(c);
      this.group.add(c);
    }
  }

  /** レベル（高さ）に合わせて風の筋を出す高さを変える */
  setHeight(topY: number) {
    AREA.maxY = topY + MAX_Y_ABOVE_HAND;
    for (const s of this.seeds) s.y = THREE.MathUtils.randFloat(AREA.minY, AREA.maxY);
  }

  update(dt: number) {
    this.time += dt;
    const dir = this.wind.direction;
    const speed = this.wind.speed;
    const flow = 1.2 + speed * 1.8; // 見た目の流速
    const len = 0.25 + speed * 0.25;

    for (let i = 0; i < STREAKS; i++) {
      const s = this.seeds[i];
      s.addScaledVector(dir, flow * dt * (0.8 + (i % 5) * 0.1));
      // 範囲外に出たら反対側へ
      if (s.x > AREA.maxX) s.x = AREA.minX;
      if (s.x < AREA.minX) s.x = AREA.maxX;
      if (s.z > AREA.maxZ) s.z = AREA.minZ;
      if (s.z < AREA.minZ) s.z = AREA.maxZ;
      const wobble = Math.sin(this.time * 2 + i) * 0.05;
      const o = i * 6;
      this.streakPos[o] = s.x;
      this.streakPos[o + 1] = s.y + wobble;
      this.streakPos[o + 2] = s.z;
      this.streakPos[o + 3] = s.x - dir.x * len;
      this.streakPos[o + 4] = s.y + wobble;
      this.streakPos[o + 5] = s.z - dir.z * len;
    }
    this.streakGeo.attributes.position.needsUpdate = true;

    // 旗：風下へたなびく。弱い風ほど垂れ下がる
    const strength = THREE.MathUtils.clamp(speed / 3.6, 0, 1);
    this.flagPivot.rotation.set(0, Math.atan2(-dir.z, dir.x), 0);
    this.flag.rotation.z = -(1 - strength) * 1.1 - 0.1;
    const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const freq = 4 + speed * 2.5;
    for (let i = 0; i < arr.length; i += 3) {
      const x = this.flagBase[i];
      arr[i + 2] = Math.sin(x * 9 - this.time * freq) * 0.08 * x * (0.5 + strength);
    }
    pos.needsUpdate = true;
    this.flag.geometry.computeVertexNormals();

    for (const c of this.clouds) {
      c.position.x += dir.x * speed * 0.35 * dt;
      if (c.position.x > 45) c.position.x = -45;
      if (c.position.x < -45) c.position.x = 45;
    }
  }
}
