import * as THREE from 'three';
import { CONFIG, balconyFloorY, handY } from './config';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * 2階のベランダに立つプレイヤー。
 * 操作対象は「目薬の先端（ノズル）」の位置。体はそれに追従して手すり沿いを移動する。
 */
export class Player {
  readonly group = new THREE.Group();
  /** 目薬ノズル先端のワールド座標（水滴の発射点） */
  readonly nozzle = new THREE.Vector3();

  private body = new THREE.Group();
  private torso: THREE.Mesh;
  private arm: THREE.Mesh;
  private bottle = new THREE.Group();
  private squeeze = 0;
  private x = CONFIG.player.startX;
  private z = CONFIG.player.startZ;

  constructor() {
    const floorY = balconyFloorY();
    const shirt = new THREE.MeshStandardMaterial({ color: 0xe0584a, roughness: 0.7 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c9a5, roughness: 0.6 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x33415c, roughness: 0.8 });

    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.6, 4, 12), pants);
    legs.position.y = floorY + 0.45;
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 12), shirt);
    this.torso.position.y = floorY + 1.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skin);
    head.position.y = floorY + 1.62;
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2a1d14, roughness: 0.9 }),
    );
    hair.position.y = floorY + 1.64;
    for (const m of [legs, this.torso, head, hair]) {
      m.castShadow = true;
      this.body.add(m);
    }
    this.group.add(this.body);

    // 腕（肩から手まで伸ばす円柱）
    this.arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10), shirt);
    this.arm.castShadow = true;
    this.group.add(this.arm);

    // 目薬ボトル（ノズルが下向き）
    const bottleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xf5fbff, roughness: 0.25, transparent: true, opacity: 0.9 }),
    );
    bottleBody.position.y = 0.09;
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x2f8fe0, roughness: 0.4 }),
    );
    label.position.y = 0.09;
    const neck = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0xf5fbff, roughness: 0.25 }),
    );
    neck.rotation.x = Math.PI;
    neck.position.y = 0.025;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), skin);
    hand.position.y = 0.13;
    hand.scale.set(1.2, 0.8, 1.2);
    this.bottle.add(bottleBody, label, neck, hand);
    this.bottle.traverse((o) => (o.castShadow = true));
    this.group.add(this.bottle);

    this.setPosition(this.x, this.z);
  }

  get position() {
    return { x: this.x, z: this.z };
  }

  /** ノズル位置を移動範囲内に制限してセット */
  setPosition(x: number, z: number) {
    const p = CONFIG.player;
    this.x = THREE.MathUtils.clamp(x, p.minX, p.maxX);
    this.z = THREE.MathUtils.clamp(z, p.minZ, p.maxZ);
    this.updatePose();
  }

  move(dx: number, dz: number) {
    this.setPosition(this.x + dx, this.z + dz);
  }

  reset() {
    this.squeeze = 0;
    this.setPosition(CONFIG.player.startX, CONFIG.player.startZ);
  }

  /** 目薬を押す演出 (0-1) */
  setSqueeze(v: number) {
    this.squeeze = v;
    this.updatePose();
  }

  private updatePose() {
    const floorY = balconyFloorY();
    const balconyDepth = CONFIG.building.balconyDepth;
    const reach = this.z - CONFIG.player.minZ; // 身を乗り出す量
    const bodyZ = balconyDepth - 0.35;
    this.body.position.set(this.x - 0.25, 0, 0);
    this.body.children.forEach((c) => (c.position.z = bodyZ));
    // 乗り出すほど上体を前傾
    this.torso.rotation.x = 0.25 + reach * 0.5;

    this.nozzle.set(this.x, handY(), this.z);
    this.bottle.position.copy(this.nozzle);
    const s = 1 - this.squeeze * 0.25;
    this.bottle.scale.set(s, 1, s);

    const shoulder = new THREE.Vector3(this.x - 0.1, floorY + 1.35, bodyZ + 0.1);
    const hand = this.nozzle.clone().add(new THREE.Vector3(0, 0.13, 0));
    const dir = hand.clone().sub(shoulder);
    const len = dir.length();
    this.arm.scale.set(1, len, 1);
    this.arm.position.copy(shoulder).addScaledVector(dir, 0.5);
    this.arm.quaternion.setFromUnitVectors(UP, dir.normalize());
  }
}
