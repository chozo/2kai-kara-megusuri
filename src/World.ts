import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CONFIG } from './config';
import { makeGrassTexture, makePavingTexture, makeSkyTexture } from './textures';

/** レンダラ・シーン・ライト・地面・背景小物などの「舞台」 */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 9 / 16, 0.01, 300);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(0xcfe6f6, 45, 150);

    this.setupLights();
    this.setupGround();
    this.setupProps();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get size() {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x8a7a60, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    sun.position.set(6, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -8;
    s.right = 8;
    s.top = 20;
    s.bottom = -6;
    s.near = 1;
    s.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
    this.scene.add(sun.target);
  }

  private setupGround() {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240),
      new THREE.MeshStandardMaterial({ map: makeGrassTexture(80), roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // 0.5m 目地のタイル（位置関係を読む手がかり）
    const paving = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 14),
      new THREE.MeshStandardMaterial({ map: makePavingTexture(12), roughness: 0.95 }),
    );
    (paving.material as THREE.MeshStandardMaterial).map!.repeat.set(12, 7);
    paving.rotation.x = -Math.PI / 2;
    paving.position.set(0, 0, 3);
    paving.receiveShadow = true;
    this.scene.add(paving);
  }

  private setupProps() {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.9, flatShading: true });
    const tree = (x: number, z: number, s: number) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 2 * s, 8), trunkMat);
      t.position.set(x, s, z);
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 1), leafMat);
      l.position.set(x, 2.4 * s, z);
      t.castShadow = l.castShadow = true;
      this.scene.add(t, l);
    };
    tree(-6.5, 3.5, 1.2);
    tree(7, 1.5, 1.4);
    tree(-9, -2, 1.6);
    tree(10, 7, 1.1);

    // 近所の家
    const houseColors = [0xd9c2a3, 0xb8c9d6, 0xe3d9c9, 0xc9b1a1];
    const house = (x: number, z: number, w: number, h: number, d: number, c: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }));
      b.position.set(x, h / 2, z);
      const r = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.35, 4),
        new THREE.MeshStandardMaterial({ color: 0x6a4038, roughness: 0.8 }),
      );
      r.rotation.y = Math.PI / 4;
      r.position.set(x, h + h * 0.17, z);
      b.castShadow = b.receiveShadow = r.castShadow = true;
      this.scene.add(b, r);
    };
    house(-14, -4, 7, 6, 6, houseColors[0]);
    house(14, -3, 6, 5.5, 6, houseColors[1]);
    house(-12, 14, 6, 5, 5, houseColors[2]);
    house(13, 15, 7, 6, 6, houseColors[3]);
    house(0, 20, 8, 6.5, 6, houseColors[1]);

    // 塀
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xa8a39a, roughness: 0.95 });
    for (const x of [-5.5, 5.5]) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.1, 8), wallMat);
      w.position.set(x, 0.55, 3.5);
      w.castShadow = w.receiveShadow = true;
      this.scene.add(w);
    }
  }
}
