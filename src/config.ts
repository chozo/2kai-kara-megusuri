/**
 * ゲームパラメータ集約ファイル。
 * バランス調整はほぼこのファイルだけで完結するようにしている。
 * 単位は基本的に メートル / 秒。
 */

type Vec3 = { x: number; y: number; z: number };

export interface LevelConfig {
  id: number;
  name: string;
  /** 何階から落とすか（2 = 2階） */
  floor: number;
  /** 1フロアの高さ (m) */
  floorHeight: number;
  /**
   * 表示風速の範囲 (m/s)。
   * 高い階ほど落下時間が長く、同じ風速でも大きく流される（1 m/s あたり 2階≈23cm / 3階≈54cm / 5階≈118cm）
   */
  windMin: number;
  windMax: number;
  /**
   * 風向きのうち奥行き(Z)成分の最大角度 (度)。0 なら左右の風のみ。
   * 奥行き方向のズレが、ベランダから身を乗り出せる範囲（約 ±40cm）に収まるよう制限している
   */
  windMaxDepthAngleDeg: number;
  /** 通常カメラの位置と注視点。省略時は2階の構図を高さに比例して拡大 */
  overviewPos?: Vec3;
  overviewLook?: Vec3;
  /** このプロトタイプで遊べるか */
  playable: boolean;
}

/** LEVEL 1〜3 が遊べる。4 以降は将来の拡張用の定義のみ */
export const LEVELS: LevelConfig[] = [
  {
    id: 1, name: '2階', floor: 2, floorHeight: 3.3,
    windMin: 0.6, windMax: 3.6, windMaxDepthAngleDeg: 25,
    overviewPos: { x: 5.2, y: 5.4, z: 10.8 }, overviewLook: { x: -0.3, y: 3.3, z: 1.4 },
    playable: true,
  },
  {
    id: 2, name: '3階', floor: 3, floorHeight: 3.3,
    windMin: 0.5, windMax: 3.0, windMaxDepthAngleDeg: 13,
    overviewPos: { x: 7.5, y: 8.5, z: 15.5 }, overviewLook: { x: -0.3, y: 5.0, z: 1.4 },
    playable: true,
  },
  {
    id: 3, name: '5階', floor: 5, floorHeight: 3.3,
    windMin: 0.4, windMax: 2.3, windMaxDepthAngleDeg: 8,
    overviewPos: { x: 13.3, y: 16.4, z: 26 }, overviewLook: { x: -0.3, y: 8.2, z: 1.4 },
    playable: true,
  },
  { id: 4, name: '10階', floor: 10, floorHeight: 3.3, windMin: 0.3, windMax: 1.5, windMaxDepthAngleDeg: 5, playable: false },
  { id: 5, name: '20階', floor: 20, floorHeight: 3.3, windMin: 0.3, windMax: 1.2, windMaxDepthAngleDeg: 4, playable: false },
  { id: 6, name: '超高層ビル', floor: 60, floorHeight: 3.5, windMin: 0.2, windMax: 1.0, windMaxDepthAngleDeg: 3, playable: false },
  { id: 7, name: 'タワー級', floor: 150, floorHeight: 3.5, windMin: 0.2, windMax: 1.0, windMaxDepthAngleDeg: 2, playable: false },
  { id: 8, name: '飛行機', floor: 3000, floorHeight: 3.3, windMin: 0.2, windMax: 1.0, windMaxDepthAngleDeg: 2, playable: false },
  { id: 9, name: '宇宙', floor: 30000, floorHeight: 3.3, windMin: 0.2, windMax: 1.0, windMaxDepthAngleDeg: 2, playable: false },
];

export const PLAYABLE_LEVELS = LEVELS.filter((l) => l.playable);

export const CONFIG = {
  level: LEVELS[0],

  physics: {
    /** 重力加速度 (m/s^2)。実物より弱めにして落下時間を稼いでいる */
    gravity: 4.5,
    /** DROP直後の初速度 (m/s) */
    initialVelocity: { x: 0, y: -0.3, z: 0 },
    /** 表示上の風速 1 m/s あたりの横方向加速度 (m/s^2) */
    windAccelPerMps: 0.45,
    /** 物理計算の固定ステップ (s) */
    fixedStep: 1 / 240,
  },

  building: {
    width: 9,
    depth: 6,
    /** 2階ベランダの張り出し */
    balconyDepth: 1.3,
    balconyWidth: 7,
    railingHeight: 1.0,
  },

  player: {
    /** 目薬を持つ手のベランダ床からの高さ */
    handHeightAboveFloor: 1.15,
    /** 手（目薬）の移動範囲 X（5階で最大の風でも届く幅） */
    minX: -3.1,
    maxX: 3.1,
    /** 手（目薬）の移動範囲 Z（手すりから身を乗り出す量） */
    minZ: 1.45,
    maxZ: 2.55,
    startX: 0,
    startZ: 1.7,
    /** ドラッグ 1px あたりの移動量 (m) */
    dragSensitivity: 0.004,
    /** キーボード移動速度 (m/s) */
    keySpeed: 0.8,
  },

  target: {
    /** 地上の人物の立ち位置 */
    x: 0,
    z: 2.05,
    /** 頭の半径（デフォルメで大きめ） */
    headRadius: 0.22,
    /** 顔の上向き角度 (度)。90 で真上 */
    lookUpDeg: 70,
    /** 白目の見た目の半径 */
    eyeRadius: 0.052,
    /** 黒目の見た目の半径 */
    pupilRadius: 0.026,
    /** 目の左右間隔（頭中心からの角度, 度） */
    eyeSpreadDeg: 24,
  },

  hit: {
    /** 水滴の当たり判定半径 */
    dropletRadius: 0.02,
    /** この距離以内に黒目中心があれば SUCCESS */
    pupilHitRadius: 0.06,
    /** この距離以内に目の中心があれば「惜しい」（白目） */
    eyeHitRadius: 0.1,
    /** 判定に使う頭の半径（見た目より少し広め） */
    headHitRadius: 0.23,
  },

  blink: {
    /** まばたきの間隔 (s) の範囲 */
    intervalMin: 1.4,
    intervalMax: 3.8,
    /** まばたき1回の長さ (s) */
    duration: 0.2,
    /** この閉じ具合 (0-1) 以上なら「閉じている」判定 */
    closedThreshold: 0.55,
    /** false にするとまばたき判定を無効化（練習用） */
    enabled: true,
  },

  droplet: {
    /** 表示半径（実寸より大きめ） */
    visualRadius: 0.03,
    /** DROPを押してから滴が落ちるまでの「溜め」時間 (s) */
    squeezeTime: 0.35,
  },

  camera: {
    fov: 50,
    /** 水滴追跡カメラのオフセット（水滴基準） */
    followOffset: { x: 0.55, y: 0.35, z: 1.35 },
    /** 追跡カメラの注視点オフセット（下を見る） */
    followLookOffset: { x: -0.1, y: -0.7, z: -0.2 },
    /** 顔ズームを開始する高さ（目の高さ基準, m） */
    faceZoomStartHeight: 1.1,
    /** 顔ズームを行う水平距離（これより遠い落下は地面追跡のまま） */
    faceZoomMaxHorizontalDist: 0.45,
    /** 顔ズーム時のカメラ距離 */
    faceCamDistance: 0.8,
    /** 各遷移時間 (s, 実時間) */
    toFollowDuration: 0.55,
    toFaceDuration: 0.5,
    toOverviewDuration: 0.9,
    /** レベルが変わって通常カメラの構図が変わるときの遷移時間 */
    toLevelDuration: 1.4,
  },

  time: {
    /** 全体の時間倍率（デバッグ用。URL の ?speed=0.2 でも指定可） */
    globalScale: 1,
    /** 顔付近の接近スローモーション倍率 */
    approachSlowMo: 0.3,
    /** 命中成功時スローモーション倍率と時間 (実時間 s) */
    successSlowMo: 0.12,
    successSlowMoDuration: 0.9,
    /** 結果表示から「もう一滴」ボタン表示までの時間 (s) */
    retryButtonDelay: 1.4,
    /** オールクリア：「入った！」からオールクリア演出へ切り替わるまで (s) */
    allClearDelay: 1.1,
    /** オールクリア演出（花火・紙吹雪）の長さと「タイトルへ」ボタンが出るまで (s) */
    allClearDuration: 4.5,
    allClearButtonDelay: 3.0,
  },

  audio: {
    /** 全体音量 / BGM / 効果音 (0-1) */
    master: 0.8,
    bgm: 0.22,
    sfx: 0.7,
    /** BGM のテンポ (BPM) */
    bgmTempo: 112,
  },

  effects: {
    /** 成功時の紙吹雪 */
    confettiOnSuccess: true,
  },

  /** 進行状況（クリア済みレベル）を localStorage に保存する */
  saveProgress: true,

  /** URL に ?debug を付けるか、D キー / 画面右上のDBGボタンで切替 */
  debugDefault: false,
};

export type GameConfig = typeof CONFIG;

/** 現在レベルでの2階ベランダ床の高さ */
export function balconyFloorY(): number {
  return (CONFIG.level.floor - 1) * CONFIG.level.floorHeight;
}

/** 水滴を落とす手の高さ */
export function handY(): number {
  return balconyFloorY() + CONFIG.player.handHeightAboveFloor;
}

/** 2階（LEVEL 1）の手の高さ。構図の拡大率の基準 */
const BASE_HAND_Y = CONFIG.level.floorHeight + CONFIG.player.handHeightAboveFloor;

/** 現在レベルの通常カメラ（位置・注視点） */
export function overviewPose(): { pos: Vec3; look: Vec3 } {
  const l = CONFIG.level;
  if (l.overviewPos && l.overviewLook) return { pos: l.overviewPos, look: l.overviewLook };
  const base = LEVELS[0];
  const k = handY() / BASE_HAND_Y;
  const bp = base.overviewPos!;
  const bl = base.overviewLook!;
  const look = { x: bl.x, y: bl.y * k, z: bl.z };
  return { pos: { x: bl.x + (bp.x - bl.x) * k, y: look.y + (bp.y - bl.y) * k, z: bl.z + (bp.z - bl.z) * k }, look };
}

/** 目の高さ付近までのおおよその落下時間（風切り音の長さなどに使う） */
export function estimatedFallTime(eyeY = 1.8): number {
  const g = CONFIG.physics.gravity;
  const v0 = -CONFIG.physics.initialVelocity.y;
  const h = Math.max(0.1, handY() - eyeY);
  return (-v0 + Math.sqrt(v0 * v0 + 2 * g * h)) / g;
}
