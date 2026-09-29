import * as THREE from 'three';
import { CONFIG } from './config';
import { makeGlowTexture } from './textures';

const UP = new THREE.Vector3(0, 1, 0);

/** 目薬の1滴。シンプルな陽解法で 重力 + 風 を積分する */
export class Droplet {
  readonly group = new THREE.Group();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  /** デバッグ用の軌跡 */
  readonly trail: THREE.Vector3[] = [];
  active = false;

  private mesh: THREE.Mesh;
  private glow: THREE.Sprite;
  private tmp = new THREE.Vector3();

  constructor() {
    const r = CONFIG.droplet.visualRadius;
    const geo = new THREE.SphereGeometry(r, 32, 24);
    // 下側を少し膨らませて雫形に
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0) {
        const k = y / r;
        p.setY(i, y * (1 + k * 0.7));
        p.setX(i, p.getX(i) * (1 - k * 0.45));
        p.setZ(i, p.getZ(i) * (1 - k * 0.45));
      }
    }
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({
        color: 0xc8ecff,
        roughness: 0.02,
        metalness: 0,
        transmission: 0.85,
        thickness: 0.03,
        ior: 1.33,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: 2.2,
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeGlowTexture(),
        color: 0xbfeaff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    this.glow.scale.setScalar(r * 3.2);
    this.group.add(this.mesh, this.glow);
    this.group.visible = false;
  }

  /** ノズル先端に滴が膨らんでいく演出 (progress 0-1) */
  form(nozzle: THREE.Vector3, progress: number) {
    this.group.visible = true;
    const s = 0.2 + progress * 0.8;
    this.mesh.scale.setScalar(s);
    this.mesh.quaternion.identity();
    this.glow.scale.setScalar(CONFIG.droplet.visualRadius * 3.2 * s);
    this.position.copy(nozzle).y -= CONFIG.droplet.visualRadius * s;
    this.group.position.copy(this.position);
  }

  release(nozzle: THREE.Vector3) {
    const v = CONFIG.physics.initialVelocity;
    this.position.copy(nozzle).y -= CONFIG.droplet.visualRadius;
    this.prevPosition.copy(this.position);
    this.velocity.set(v.x, v.y, v.z);
    this.mesh.scale.setScalar(1);
    this.trail.length = 0;
    this.trail.push(this.position.clone());
    this.active = true;
    this.group.visible = true;
  }

  /**
   * 1ステップ積分。
   * velocity.y += gravity * dt / velocity.xz += wind * dt / position += velocity * dt
   */
  step(dt: number, windAccel: THREE.Vector3) {
    this.prevPosition.copy(this.position);
    this.velocity.y -= CONFIG.physics.gravity * dt;
    this.velocity.x += windAccel.x * dt;
    this.velocity.z += windAccel.z * dt;
    this.position.addScaledVector(this.velocity, dt);
  }

  /** 表示の更新（速度方向に少し伸ばす） */
  sync() {
    this.group.position.copy(this.position);
    const speed = this.velocity.length();
    if (speed > 0.01) {
      this.tmp.copy(this.velocity).normalize().negate();
      this.mesh.quaternion.setFromUnitVectors(UP, this.tmp);
      const stretch = 1 + Math.min(speed * 0.04, 0.25);
      this.mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    }
    const last = this.trail[this.trail.length - 1];
    if (!last || last.distanceToSquared(this.position) > 0.0025) this.trail.push(this.position.clone());
  }

  stopAt(p: THREE.Vector3) {
    this.position.copy(p);
    this.velocity.set(0, 0, 0);
    this.active = false;
    this.group.position.copy(p);
  }

  hide() {
    this.active = false;
    this.group.visible = false;
  }
}
