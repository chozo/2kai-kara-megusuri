import * as THREE from 'three';
import { CONFIG, balconyFloorY } from './config';
import { makeSidingTexture } from './textures';

/**
 * 建物。正面は z = 0 の面で +Z 方向を向く。
 * レベルが上がったときは floor 数に応じて階を積むだけで高層化できる。
 */
export class Building {
  readonly group = new THREE.Group();

  constructor() {
    const { width, depth, balconyDepth, balconyWidth, railingHeight } = CONFIG.building;
    const floors = Math.max(CONFIG.level.floor, 2);
    const fh = CONFIG.level.floorHeight;
    const height = floors * fh + 0.4;

    // 本体
    const wallTex = makeSidingTexture(width / 2, height / 2);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
    body.position.set(0, height / 2, -depth / 2);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // 各階の境目の帯
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x8b7b66, roughness: 0.8 });
    for (let f = 1; f < floors; f++) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.12, 0.1), bandMat);
      band.position.set(0, f * fh, 0.03);
      this.group.add(band);
    }

    // 屋根
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.8, 0.3, depth + 0.8),
      new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.7 }),
    );
    roof.position.set(0, height + 0.15, -depth / 2);
    roof.castShadow = true;
    this.group.add(roof);

    // 窓
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x2c4a66,
      roughness: 0.08,
      metalness: 0.6,
      envMapIntensity: 1.2,
    });
    const addWindow = (x: number, y: number, w: number, h: number) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08), frameMat);
      frame.position.set(x, y, 0.02);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), glassMat);
      glass.position.set(x, y, 0.06);
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.06), frameMat);
      mullion.position.set(x, y, 0.08);
      this.group.add(frame, glass, mullion);
    };

    for (let f = 0; f < floors; f++) {
      const baseY = f * fh;
      if (f === 0) {
        // 1階：ドアと窓
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(1.0, 2.1, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.6 }),
        );
        door.position.set(-2.8, 1.05, 0.05);
        this.group.add(door);
        addWindow(0.2, baseY + 1.6, 2.2, 1.2);
        addWindow(3.0, baseY + 1.6, 1.2, 1.2);
      } else if (f === CONFIG.level.floor - 1) {
        // プレイヤーがいる階：ベランダに面した掃き出し窓
        addWindow(-1.2, baseY + 1.2, 1.6, 2.0);
        addWindow(0.8, baseY + 1.2, 1.6, 2.0);
        addWindow(3.2, baseY + 1.6, 0.9, 1.0);
      } else {
        addWindow(-2.2, baseY + 1.6, 1.4, 1.2);
        addWindow(1.8, baseY + 1.6, 1.4, 1.2);
      }
    }

    // ベランダ
    const floorY = balconyFloorY();
    const slabMat = new THREE.MeshStandardMaterial({ color: 0xcfc8bb, roughness: 0.8 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(balconyWidth, 0.18, balconyDepth), slabMat);
    slab.position.set(0, floorY - 0.09, balconyDepth / 2);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this.group.add(slab);

    // 手すり
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3d4a52, roughness: 0.4, metalness: 0.5 });
    const railTopY = floorY + railingHeight;
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(balconyWidth, 0.05, 0.06), railMat);
    topRail.position.set(0, railTopY, balconyDepth - 0.03);
    const lowRail = topRail.clone();
    lowRail.position.y = floorY + 0.1;
    this.group.add(topRail, lowRail);
    for (const side of [-1, 1]) {
      const sideRail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, balconyDepth), railMat);
      sideRail.position.set((side * balconyWidth) / 2, railTopY, balconyDepth / 2);
      this.group.add(sideRail);
    }
    const barCount = Math.floor(balconyWidth / 0.14);
    const bars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.025, railingHeight, 0.025),
      railMat,
      barCount,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < barCount; i++) {
      m.makeTranslation(-balconyWidth / 2 + (i + 0.5) * (balconyWidth / barCount), floorY + railingHeight / 2, balconyDepth - 0.03);
      bars.setMatrixAt(i, m);
    }
    bars.castShadow = true;
    this.group.add(bars);

    // エアコン室外機（2階らしさ）
    const unit = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.55, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 }),
    );
    unit.position.set(-2.9, floorY + 0.28, 0.25);
    unit.castShadow = true;
    this.group.add(unit);
  }
}
