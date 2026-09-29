import * as THREE from 'three';
import { CONFIG, PLAYABLE_LEVELS, estimatedFallTime, handY, overviewPose } from './config';
import { World } from './World';
import { Building } from './Building';
import { Player } from './Player';
import { TargetCharacter, type Reaction } from './TargetCharacter';
import { Droplet } from './Droplet';
import { Wind, WindVisuals } from './Wind';
import { CameraController } from './CameraController';
import { HitDetector, type HitKind, type HitResult } from './HitDetector';
import { Effects } from './Effects';
import { UI } from './UI';
import { InputController } from './InputController';
import { Debug } from './Debug';
import { GameAudio } from './Audio';
import { Confetti } from './Confetti';

type State = 'title' | 'aim' | 'squeeze' | 'falling' | 'impact' | 'result' | 'allclear';

const REACTION: Record<HitKind, Reaction> = {
  success: 'success',
  near: 'near',
  blink: 'blink',
  face: 'face',
  head: 'miss',
  body: 'miss',
  ground: 'miss',
};

/** ゲーム全体の状態遷移とメインループ */
export class Game {
  private world: World;
  private building = new Building();
  private player = new Player();
  private target = new TargetCharacter();
  private droplet = new Droplet();
  private wind = new Wind();
  private windVisuals = new WindVisuals(this.wind);
  private windAccel = new THREE.Vector3();
  private effects = new Effects();
  private camera: CameraController;
  private hit: HitDetector;
  private ui = new UI();
  private input: InputController;
  private debug: Debug;
  private audio = new GameAudio();
  private confetti: Confetti;

  private state: State = 'aim';
  private stateTime = 0;
  private timeScale = 1;
  private slowMoTimer = 0;
  private accumulator = 0;
  private lastHit: HitResult | null = null;
  private clock = new THREE.Clock();
  private tries = 0;
  /** 前回と同じ風で再挑戦中か */
  private sameWind = false;
  private successes = 0;
  /** タイトルからの累計滴数（オールクリア表示用） */
  private runTries = 0;
  /** 現在のレベル（PLAYABLE_LEVELS のインデックス） */
  private levelIndex = 0;
  /** 選べる最大のレベル（クリアすると増える） */
  private unlocked = 0;

  constructor(container: HTMLElement) {
    this.world = new World(container);
    this.confetti = new Confetti(container);
    const scene = this.world.scene;
    scene.add(
      this.building.group,
      this.player.group,
      this.target.group,
      this.droplet.group,
      this.windVisuals.group,
      this.effects.group,
    );
    this.camera = new CameraController(this.world.camera, this.droplet, this.target);
    this.hit = new HitDetector(this.target);
    this.debug = new Debug(this.droplet, this.target, this.wind, this.player);
    scene.add(this.debug.group);

    this.input = new InputController(this.ui.dragArea);
    this.input.onMove = (dx, dz) => {
      if (this.state === 'aim') this.player.move(dx, dz);
    };
    this.input.onFirstMove = () => this.ui.hideHint();
    this.input.onDrop = () => {
      if (this.state === 'title') this.start();
      else if (this.state === 'aim') this.drop();
      else if (this.state === 'allclear' && this.ui.toTitleReady) this.goToTitle();
      else if (this.state === 'result') this.retry();
    };
    this.input.onToggleDebug = () => this.setDebug(!this.debug.visible);

    this.ui.startButton.addEventListener('click', () => this.start());
    this.ui.toTitleButton.addEventListener('click', () => this.goToTitle());
    this.confetti.onFirework = () => this.audio.firework();
    this.ui.dropButton.addEventListener('click', () => this.drop());
    this.ui.retryButton.addEventListener('click', () => this.retry());
    this.ui.soundButton.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted);
      this.ui.setMuted(this.audio.muted);
    });
    this.ui.setMuted(this.audio.muted);
    // 自動再生制限のため、最初のユーザー操作で音を有効化して BGM を開始する
    const unlockAudio = () => {
      this.audio.unlock();
      if (this.audio.ready && !this.audio.bgmPlaying) {
        this.audio.startBgm();
        this.audio.setWind(this.wind.speed);
      }
    };
    container.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    this.ui.debugButton.addEventListener('click', () => this.setDebug(!this.debug.visible));
    this.ui.buildLevelButtons(PLAYABLE_LEVELS.map((l) => l.name));
    this.ui.onSelectLevel = (i) => this.selectLevel(i);
    this.unlocked = loadProgress();

    const params = new URLSearchParams(location.search);
    this.setDebug(CONFIG.debugDefault || params.has('debug'));
    const speed = Number(params.get('speed'));
    if (speed > 0) CONFIG.time.globalScale = speed;
    new ResizeObserver(() => this.refreshWindUI()).observe(container);

    this.applyLevel(0);
    this.newRound();
    // 最初はタイトル画面（?notitle で省略できる）
    if (!params.has('notitle')) {
      this.setState('title');
      this.ui.showTitle();
    }
    this.world.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- 状態遷移

  /** タイトル画面からゲーム開始 */
  private start() {
    if (this.state !== 'title') return;
    this.audio.unlock();
    this.audio.tap();
    this.ui.hideTitle();
    this.runTries = 0;
    this.setState('aim');
    this.ui.showAim();
  }

  /** 「入った！」のあと、オールクリアの演出を始める */
  private startAllClear() {
    this.setState('allclear');
    this.ui.showAllClear(this.runTries, CONFIG.time.allClearButtonDelay * 1000);
    this.confetti.clear();
    this.confetti.celebrate(CONFIG.time.allClearDuration);
    this.audio.duckBgm(true);
    this.audio.allClear();
    this.target.celebrate();
    this.camera.pushIn = 0;
    this.camera.setMode('celebrate', 1.2);
  }

  /** オールクリア後：LEVEL 1 に戻してタイトル画面へ */
  private goToTitle() {
    if (this.state !== 'allclear') return;
    this.audio.tap();
    this.ui.hideAllClear();
    this.confetti.clear();
    this.applyLevel(0);
    this.lastHit = null; // 新しい風にする
    this.camera.setMode('overview', CONFIG.camera.toLevelDuration);
    this.newRound();
    this.setState('title');
    this.ui.showTitle();
  }

  /** レベルを切り替える：建物とプレイヤーを高さに合わせて作り直す */
  private applyLevel(index: number) {
    this.levelIndex = index;
    CONFIG.level = PLAYABLE_LEVELS[index];
    const scene = this.world.scene;
    scene.remove(this.building.group, this.player.group);
    disposeTree(this.building.group);
    disposeTree(this.player.group);
    this.building = new Building();
    this.player = new Player();
    scene.add(this.building.group, this.player.group);
    this.debug.setPlayer(this.player);
    this.windVisuals.setHeight(handY());
    this.ui.setLevel(`LEVEL ${CONFIG.level.id} : ${CONFIG.level.name}`);
    this.ui.setLevelButtons(this.levelIndex, this.unlocked);
  }

  /** レベル選択ボタン（位置調整中のみ） */
  private selectLevel(index: number) {
    if (this.state !== 'aim' || index === this.levelIndex || index > this.unlocked) return;
    this.audio.tap();
    this.applyLevel(index);
    this.lastHit = null; // 新しい風にする
    this.camera.setMode('overview', CONFIG.camera.toLevelDuration, true);
    this.newRound();
  }

  private get isLastLevel() {
    return this.levelIndex >= PLAYABLE_LEVELS.length - 1;
  }

  /** 最後のレベルで目に入った */
  private get isAllClear() {
    return this.isLastLevel && this.lastHit?.kind === 'success';
  }

  private newRound() {
    // 命中するまでは同じ風で再挑戦。成功したら（または初回・レベル変更時は）新しい風にする
    this.sameWind = this.lastHit !== null && this.lastHit.kind !== 'success';
    if (!this.sameWind) this.wind.randomize();
    this.wind.acceleration(this.windAccel);
    this.droplet.hide();
    this.effects.clear();
    this.confetti.clear();
    this.audio.setWind(this.wind.speed);
    this.audio.duckBgm(false);
    this.target.reset();
    this.player.setSqueeze(0);
    this.camera.pushIn = 0;
    this.lastHit = null;
    this.setState('aim');
    this.refreshWindUI();
    this.ui.showAim();
  }

  private drop() {
    if (this.state !== 'aim') return;
    this.tries++;
    this.runTries++;
    this.audio.unlock();
    this.audio.squeeze();
    this.audio.duckBgm(true);
    this.setState('squeeze');
    this.ui.showDropping();
    this.camera.setMode('follow', CONFIG.camera.toFollowDuration + CONFIG.droplet.squeezeTime);
  }

  private retry() {
    if (this.state !== 'result') return;
    this.audio.tap();
    // 成功したら次のレベルへ
    if (this.lastHit?.kind === 'success' && !this.isLastLevel) {
      this.applyLevel(this.levelIndex + 1);
      this.camera.setMode('overview', CONFIG.camera.toLevelDuration);
    } else {
      this.camera.setMode('overview', CONFIG.camera.toOverviewDuration);
    }
    this.newRound();
  }

  private setState(s: State) {
    this.state = s;
    this.stateTime = 0;
    this.input.enabled = s === 'aim';
  }

  private setDebug(v: boolean) {
    this.debug.setVisible(v);
    this.ui.setDebugVisible(v);
  }

  // ---------------------------------------------------------------- ループ

  private frame() {
    const realDt = Math.min(this.clock.getDelta(), 1 / 20) * CONFIG.time.globalScale;
    this.updateTimeScale(realDt);
    const dt = realDt * this.timeScale;
    this.stateTime += realDt;

    this.input.update(realDt);
    this.target.update(dt);
    this.windVisuals.update(dt);
    this.effects.update(dt);

    switch (this.state) {
      case 'squeeze': {
        const p = Math.min(1, this.stateTime / CONFIG.droplet.squeezeTime);
        this.player.setSqueeze(Math.sin(p * Math.PI));
        this.droplet.form(this.player.nozzle, p);
        if (p >= 1) {
          this.player.setSqueeze(0);
          this.droplet.release(this.player.nozzle);
          this.audio.release(estimatedFallTime());
          this.accumulator = 0;
          this.setState('falling');
        }
        break;
      }
      case 'falling':
        this.stepPhysics(dt);
        this.updateFallingCamera();
        break;
      case 'impact':
        this.updateImpact(dt);
        if (this.stateTime > this.impactHoldTime()) this.showResult();
        break;
      case 'result':
        if (this.isAllClear && this.stateTime > CONFIG.time.allClearDelay) this.startAllClear();
        break;
    }

    this.camera.update(realDt);
    this.debug.update(realDt);
    if (this.debug.visible) {
      if (this.state === 'aim') this.debug.updatePrediction(this.windAccel);
      this.ui.setDebugText(this.debug.text(this.state, this.timeScale));
    }
    this.world.render();
  }

  private stepPhysics(dt: number) {
    const h = CONFIG.physics.fixedStep;
    this.accumulator += dt;
    while (this.accumulator >= h) {
      this.accumulator -= h;
      this.droplet.step(h, this.windAccel);
      const res = this.hit.check(this.droplet.prevPosition, this.droplet.position);
      if (res) {
        this.onImpact(res);
        return;
      }
    }
    this.droplet.sync();
  }

  private updateFallingCamera() {
    const c = CONFIG.camera;
    const eyes = this.target.eyesMidWorld();
    const d = this.droplet.position;
    if (this.camera.mode === 'follow' && d.y < eyes.y + c.faceZoomStartHeight) {
      const horiz = Math.hypot(d.x - eyes.x, d.z - eyes.z);
      const toFace = horiz < c.faceZoomMaxHorizontalDist;
      this.camera.setMode(toFace ? 'face' : 'ground', c.toFaceDuration);
      if (toFace) this.audio.slowMo();
    } else if (this.camera.mode === 'face' && d.y < eyes.y - 0.25) {
      // 顔の横をすり抜けた：地面まで追いかける
      this.camera.setMode('ground', c.toFaceDuration);
    }
  }

  private updateTimeScale(realDt: number) {
    let goal = 1;
    if (this.state === 'falling' && this.camera.mode === 'face') {
      const eyes = this.target.eyesMidWorld();
      const h = THREE.MathUtils.clamp((this.droplet.position.y - eyes.y) / CONFIG.camera.faceZoomStartHeight, 0, 1);
      goal = THREE.MathUtils.lerp(CONFIG.time.approachSlowMo, 1, h * h);
    }
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= realDt;
      goal = CONFIG.time.successSlowMo;
    }
    this.timeScale = THREE.MathUtils.damp(this.timeScale, goal, 10, realDt);
  }

  // ---------------------------------------------------------------- 着弾

  private onImpact(res: HitResult) {
    this.lastHit = res;
    this.droplet.stopAt(res.point);
    this.audio.stopWhoosh();
    if (res.kind === 'success') this.audio.plop();
    else if (res.kind === 'ground') this.audio.groundSplash();
    else this.audio.splat();
    this.target.setReaction(REACTION[res.kind], res.eyeIndex);
    const normal =
      res.kind === 'ground' || res.kind === 'body'
        ? new THREE.Vector3(0, 1, 0)
        : res.point.clone().sub(this.target.headCenterWorld()).normalize();
    if (res.kind === 'success') {
      this.successes++;
      if (this.unlocked < PLAYABLE_LEVELS.length - 1 && this.unlocked <= this.levelIndex) {
        this.unlocked = this.levelIndex + 1;
        saveProgress(this.unlocked);
      }
      this.slowMoTimer = CONFIG.time.successSlowMoDuration;
      this.effects.splash(res.point, normal, 0.6, 8);
    } else {
      this.effects.splash(res.point, normal, res.kind === 'ground' ? 2 : 1, res.kind === 'ground' ? 22 : 14);
    }
    this.setState('impact');
  }

  private updateImpact(dt: number) {
    if (!this.lastHit) return;
    // 着弾後、水滴は目に吸い込まれる / 潰れて消える
    const k = Math.max(0, 1 - this.stateTime * (this.lastHit.kind === 'success' ? 1.2 : 6));
    if (k <= 0) this.droplet.hide();
    else this.droplet.group.scale.set(1 + (1 - k) * 0.8, k, 1 + (1 - k) * 0.8);
    if (this.lastHit.kind === 'success' && this.camera.mode === 'face') {
      this.camera.pushIn = Math.min(1, this.camera.pushIn + dt * 6);
    }
  }

  private impactHoldTime() {
    return this.lastHit?.kind === 'success' ? CONFIG.time.successSlowMoDuration * 0.8 : 0.45;
  }

  private showResult() {
    const res = this.lastHit!;
    this.droplet.group.scale.set(1, 1, 1);
    this.setState('result');
    const cm = Math.round(res.pupilDistance * 100);
    let detail: string;
    switch (res.kind) {
      case 'success':
        detail = cm <= 1 ? 'ど真ん中！' : `黒目の中心から ${cm} cm`;
        break;
      case 'blink':
        detail = 'まばたきの瞬間だった…';
        break;
      default:
        detail = this.offsetText(res);
    }
    let sub: string | undefined;
    let retryLabel = 'もう一滴';
    if (res.kind === 'success') {
      if (this.isLastLevel) {
        sub = 'ALL CLEAR!';
      } else {
        const next = PLAYABLE_LEVELS[this.levelIndex + 1];
        sub = `LEVEL ${next.id}（${next.name}）へ！`;
        retryLabel = `${next.name}へ進む`;
      }
    }
    // オールクリアのときは「もう一滴」ボタンを出さず、そのままオールクリア演出へ
    const retryDelay = this.isAllClear ? -1 : CONFIG.time.retryButtonDelay * 1000;
    this.ui.showResult(res.kind, detail, retryDelay, sub, retryLabel);
    if (this.isAllClear) {
      this.confetti.burst();
    } else if (res.kind === 'success') {
      this.audio.fanfare();
      if (CONFIG.effects.confettiOnSuccess) this.confetti.burst();
    } else if (res.kind === 'near' || res.kind === 'blink') {
      this.audio.near();
    } else {
      this.audio.miss();
    }
    this.audio.duckBgm(false);
    this.ui.setStats(this.successes, this.tries);
  }

  /** 最寄りの黒目から見て、どちらにズレたか（通常カメラ基準の 左右 / 奥・手前） */
  private offsetText(res: HitResult): string {
    const pupil = this.target.pupilWorld(res.eyeIndex);
    const dx = Math.round((res.point.x - pupil.x) * 100);
    const dz = Math.round((res.point.z - pupil.z) * 100);
    const dist = Math.round(Math.hypot(dx, dz));
    const parts: string[] = [];
    if (Math.abs(dx) >= 2) parts.push(`${dx > 0 ? '右' : '左'}に ${Math.abs(dx)}cm`);
    if (Math.abs(dz) >= 2) parts.push(`${dz > 0 ? '手前' : '奥'}に ${Math.abs(dz)}cm`);
    return `黒目まで ${dist} cm` + (parts.length ? `\n（${parts.join('・')} ズレ）` : '');
  }

  // ---------------------------------------------------------------- 風表示

  /** 風向きを通常カメラから見た画面上の向きに変換して表示 */
  private refreshWindUI() {
    const o = overviewPose();
    const cam = new THREE.PerspectiveCamera(CONFIG.camera.fov, this.world.camera.aspect, 0.1, 200);
    cam.position.set(o.pos.x, o.pos.y, o.pos.z);
    cam.lookAt(o.look.x, o.look.y, o.look.z);
    cam.updateMatrixWorld();
    const base = this.target.eyesMidWorld();
    const a = base.clone().project(cam);
    const b = base.clone().add(this.wind.direction).project(cam);
    const { width, height } = this.world.size;
    const angle = Math.atan2((b.y - a.y) * height, (b.x - a.x) * width);

    const dir = this.wind.direction;
    let desc = dir.x < 0 ? '左へ' : '右へ';
    if (dir.z > 0.2) desc += '・やや手前へ';
    else if (dir.z < -0.2) desc += '・やや奥へ';
    this.ui.setWind(this.wind.speed, angle, desc, this.sameWind);
  }
}

/** GPU リソースを解放（レベル切替で建物などを作り直すとき） */
function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  });
}

const PROGRESS_KEY = 'megusuri-unlocked';

function loadProgress(): number {
  if (!CONFIG.saveProgress) return 0;
  try {
    const n = Number(localStorage.getItem(PROGRESS_KEY));
    return Number.isInteger(n) ? THREE.MathUtils.clamp(n, 0, PLAYABLE_LEVELS.length - 1) : 0;
  } catch {
    return 0;
  }
}

function saveProgress(n: number) {
  if (!CONFIG.saveProgress) return;
  try {
    localStorage.setItem(PROGRESS_KEY, String(n));
  } catch {
    /* 保存できなくてもゲームは続ける */
  }
}
