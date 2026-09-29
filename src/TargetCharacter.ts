import * as THREE from 'three';
import { CONFIG } from './config';

const Z = new THREE.Vector3(0, 0, 1);

export type Reaction = 'none' | 'success' | 'near' | 'face' | 'blink' | 'miss';

interface Eye {
  group: THREE.Group;
  pupil: THREE.Mesh;
  lid: THREE.Mesh;
  lash: THREE.Mesh;
  closed: number;
}

/**
 * 地上で上を向いて立っている人物。
 * ローカル座標では +Z が正面。グループごと Y 軸 180° 回転して建物側を向く。
 */
export class TargetCharacter {
  readonly group = new THREE.Group();
  readonly head = new THREE.Group();
  readonly eyes: Eye[] = [];
  private brows: THREE.Mesh[] = [];
  private arms: THREE.Group[] = [];
  /** オールクリア時のバンザイ・ジャンプ */
  private celebrating = false;
  private celebrateTime = 0;
  private mouth: THREE.Mesh;

  private blinkTimer = 0;
  private blinkElapsed = -1;
  private pendingDoubleBlink = false;
  private reaction: Reaction = 'none';
  private reactionTime = 0;
  private reactedEye = 0;

  constructor() {
    const t = CONFIG.target;
    const R = t.headRadius;
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c29c, roughness: 0.55 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x4f8f6f, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2d2f3a, roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.95 });

    // 体
    const add = (mesh: THREE.Mesh, x: number, y: number, z = 0) => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    add(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.7, 4, 10), pants), -0.1, 0.43);
    add(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.7, 4, 10), pants), 0.1, 0.43);
    const torso = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 4, 14), shirt), 0, 1.08);
    torso.rotation.x = -0.12; // 上を見上げて少し反る
    for (const side of [-1, 1]) {
      // 肩を支点に回せるよう、ピボット（肩）の下に腕をぶら下げる
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.27, 1.33, -0.02);
      pivot.rotation.z = side * 0.18;
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 10), shirt);
      arm.position.y = -0.28;
      arm.castShadow = true;
      pivot.add(arm);
      this.group.add(pivot);
      this.arms.push(pivot);
    }
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 12), skin), 0, 1.44, -0.03);

    // 頭（上を向く）
    this.head.position.set(0, 1.52 + R * 0.55, -0.06);
    this.head.rotation.x = -THREE.MathUtils.degToRad(t.lookUpDeg);
    this.group.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 30), skin);
    skull.castShadow = true;
    this.head.add(skull);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(R * 1.05, 32, 24), hairMat);
    hair.position.set(0, 0.03, -0.05);
    hair.castShadow = true;
    this.head.add(hair);

    const onFace = (yawDeg: number, pitchDeg: number, r = R) => {
      const yaw = THREE.MathUtils.degToRad(yawDeg);
      const pitch = THREE.MathUtils.degToRad(pitchDeg);
      return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(r);
    };

    // 目
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 });
    const irisMat = new THREE.MeshStandardMaterial({ color: 0x1c120c, roughness: 0.1 });
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lashMat = new THREE.MeshBasicMaterial({ color: 0x20140c });
    for (const side of [-1, 1]) {
      const g = new THREE.Group();
      const dir = onFace(side * t.eyeSpreadDeg, 6, 1);
      g.position.copy(dir).multiplyScalar(R - t.eyeRadius * 0.45);
      g.quaternion.setFromUnitVectors(Z, dir);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(t.eyeRadius, 28, 20), white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(t.pupilRadius, 24, 16), irisMat);
      pupil.position.z = t.eyeRadius - t.pupilRadius * 0.35;
      pupil.scale.z = 0.5;
      const hl = new THREE.Mesh(new THREE.SphereGeometry(t.pupilRadius * 0.28, 10, 8), hlMat);
      hl.position.set(t.pupilRadius * 0.35, t.pupilRadius * 0.4, t.eyeRadius + 0.001);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(t.eyeRadius * 1.12, 28, 20), skin);
      lid.visible = false;
      const lash = new THREE.Mesh(new THREE.BoxGeometry(t.eyeRadius * 2.1, 0.006, 0.01), lashMat);
      lash.position.z = t.eyeRadius * 1.1;
      lash.visible = false;
      g.add(ball, pupil, hl, lid, lash);
      this.head.add(g);
      this.eyes.push({ group: g, pupil, lid, lash, closed: 0 });

      // 眉
      const brow = new THREE.Mesh(new THREE.BoxGeometry(t.eyeRadius * 2.2, 0.014, 0.02), hairMat);
      const bdir = onFace(side * t.eyeSpreadDeg, 26, 1);
      brow.position.copy(bdir).multiplyScalar(R + 0.002);
      brow.quaternion.setFromUnitVectors(Z, bdir);
      this.head.add(brow);
      this.brows.push(brow);

      // 耳
      const ear = new THREE.Mesh(new THREE.SphereGeometry(R * 0.22, 12, 10), skin);
      ear.position.copy(onFace(side * 90, 0, R * 0.98));
      ear.scale.set(0.5, 1, 0.8);
      this.head.add(ear);
    }

    // 鼻
    const nose = new THREE.Mesh(new THREE.SphereGeometry(R * 0.13, 16, 12), skin);
    nose.position.copy(onFace(0, -12, R * 1.02));
    nose.scale.set(0.9, 1.1, 1.2);
    this.head.add(nose);

    // 口（ぽかん）
    this.mouth = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.12, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x6a1e1e, roughness: 0.6 }),
    );
    const mdir = onFace(0, -38, 1);
    this.mouth.position.copy(mdir).multiplyScalar(R * 0.97);
    this.mouth.quaternion.setFromUnitVectors(Z, mdir);
    this.mouth.scale.set(1.3, 0.7, 0.4);
    this.head.add(this.mouth);

    this.group.position.set(t.x, 0, t.z);
    this.group.rotation.y = Math.PI; // 建物(-Z)の方を向く
    this.scheduleBlink();
  }

  reset() {
    this.celebrating = false;
    this.group.position.y = 0;
    this.arms.forEach((a, i) => (a.rotation.z = (i === 0 ? -1 : 1) * 0.18));
    this.reaction = 'none';
    this.reactionTime = 0;
    this.blinkElapsed = -1;
    this.scheduleBlink();
    this.head.position.x = 0;
    this.brows.forEach((b) => (b.position.setLength(CONFIG.target.headRadius + 0.002)));
  }

  private scheduleBlink(soon = false) {
    const b = CONFIG.blink;
    this.blinkTimer = soon ? 0.12 : THREE.MathUtils.randFloat(b.intervalMin, b.intervalMax);
  }

  /** dt はゲーム内時間（スローモーション時は小さくなる） */
  update(dt: number) {
    const b = CONFIG.blink;
    let blinkClosed = 0;
    if (this.reaction === 'none' && b.enabled) {
      if (this.blinkElapsed < 0) {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkElapsed = 0;
          this.pendingDoubleBlink = Math.random() < 0.2;
        }
      }
      if (this.blinkElapsed >= 0) {
        this.blinkElapsed += dt;
        const p = this.blinkElapsed / b.duration;
        if (p >= 1) {
          this.blinkElapsed = -1;
          this.scheduleBlink(this.pendingDoubleBlink);
          this.pendingDoubleBlink = false;
        } else {
          blinkClosed = Math.sin(Math.PI * p);
        }
      }
    }

    if (this.reaction !== 'none') {
      this.reactionTime += dt;
      const rt = this.reactionTime;
      const shake = Math.sin(rt * 40) * Math.exp(-rt * 3) * 0.02;
      this.head.position.x = shake;
      this.eyes.forEach((eye, i) => {
        let c = 0;
        switch (this.reaction) {
          case 'success':
            c = Math.min(1, rt * 12); // ぎゅっと閉じる
            break;
          case 'near':
            c = i === this.reactedEye ? Math.min(1, rt * 10) : Math.min(0.5, rt * 4);
            break;
          case 'face':
          case 'blink':
            c = Math.min(1, rt * 10);
            break;
          case 'miss':
            c = 0;
            break;
        }
        eye.closed = c;
      });
      const browLift = this.reaction === 'miss' ? 0.012 : -0.006;
      this.brows.forEach((br) => br.position.setLength(CONFIG.target.headRadius + 0.002 + browLift * Math.min(1, rt * 5)));
    } else {
      this.eyes.forEach((e) => (e.closed = blinkClosed));
    }

    if (this.celebrating) {
      this.celebrateTime += dt;
      const t = this.celebrateTime;
      this.group.position.y = Math.abs(Math.sin(t * 6)) * 0.22;
      this.arms.forEach((a, i) => {
        const side = i === 0 ? -1 : 1;
        a.rotation.z = side * (2.55 + Math.sin(t * 12 + i) * 0.25);
      });
    }

    for (const eye of this.eyes) {
      eye.lid.visible = eye.closed > 0.02;
      eye.lid.scale.set(1, Math.max(0.02, eye.closed), 1);
      eye.lash.visible = eye.closed > 0.85;
    }
  }

  /** オールクリアでバンザイしながら跳ねる */
  celebrate() {
    this.celebrating = true;
    this.celebrateTime = 0;
  }

  setReaction(r: Reaction, eyeIndex = 0) {
    this.reaction = r;
    this.reactionTime = 0;
    this.reactedEye = eyeIndex;
  }

  isEyeClosed(i: number): boolean {
    return this.eyes[i].closed >= CONFIG.blink.closedThreshold;
  }

  headCenterWorld(target = new THREE.Vector3()) {
    return this.head.getWorldPosition(target);
  }

  eyeCenterWorld(i: number, target = new THREE.Vector3()) {
    return this.eyes[i].group.getWorldPosition(target);
  }

  pupilWorld(i: number, target = new THREE.Vector3()) {
    return this.eyes[i].pupil.getWorldPosition(target);
  }

  /** 両目の中点 */
  eyesMidWorld(target = new THREE.Vector3()) {
    const a = this.eyeCenterWorld(0);
    const b = this.eyeCenterWorld(1);
    return target.copy(a).add(b).multiplyScalar(0.5);
  }

  /** 顔の正面方向（ワールド） */
  faceNormalWorld(target = new THREE.Vector3()) {
    const q = new THREE.Quaternion();
    this.head.getWorldQuaternion(q);
    return target.copy(Z).applyQuaternion(q).normalize();
  }

  /** 額の方向（顔ズーム時のカメラ上方向） */
  foreheadDirWorld(target = new THREE.Vector3()) {
    const q = new THREE.Quaternion();
    this.head.getWorldQuaternion(q);
    return target.set(0, 1, 0).applyQuaternion(q).normalize();
  }

  /** 体（胴・脚）とのおおまかな当たり：頭より下の円柱 */
  hitsBody(p: THREE.Vector3): boolean {
    const dx = p.x - this.group.position.x;
    const dz = p.z - this.group.position.z;
    return p.y < 1.5 && p.y > 0 && dx * dx + dz * dz < 0.26 * 0.26;
  }
}
