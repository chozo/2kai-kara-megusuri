import * as THREE from 'three';

/** Canvas で手続き的にテクスチャを作る（外部アセット不要） */
function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** 外壁：横方向のサイディング。落下時に上へ流れて速度感を出す */
export function makeSidingTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#e9dcc6';
      ctx.fillRect(0, 0, 256, 256);
      const rows = 8;
      for (let i = 0; i < rows; i++) {
        const y = (i * 256) / rows;
        ctx.fillStyle = i % 2 === 0 ? '#e3d4bb' : '#eee2cf';
        ctx.fillRect(0, y, 256, 256 / rows);
        ctx.fillStyle = 'rgba(90,70,40,0.35)';
        ctx.fillRect(0, y, 256, 2);
      }
      // 縦目地
      ctx.fillStyle = 'rgba(90,70,40,0.18)';
      for (let i = 0; i < 4; i++) ctx.fillRect(i * 64 + ((i * 37) % 20), 0, 2, 256);
      // 汚れ
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = `rgba(80,60,30,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
      }
    },
    repeatX,
    repeatY,
  );
}

/** 地面：0.5m 目地の舗装タイル。距離感を読む手がかりになる */
export function makePavingTexture(repeat: number): THREE.CanvasTexture {
  return canvasTexture(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#b9b3a8';
      ctx.fillRect(0, 0, 256, 256);
      const n = 4;
      const s = 256 / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const shade = 170 + Math.floor(Math.random() * 25);
          ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 12})`;
          ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
        }
      }
      for (let i = 0; i < 600; i++) {
        ctx.fillStyle = `rgba(60,50,40,${Math.random() * 0.12})`;
        ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
      }
    },
    repeat,
    repeat,
  );
}

export function makeGrassTexture(repeat: number): THREE.CanvasTexture {
  return canvasTexture(
    128,
    128,
    (ctx) => {
      ctx.fillStyle = '#6f9d4a';
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) {
        const g = 120 + Math.floor(Math.random() * 60);
        ctx.fillStyle = `rgba(${g - 60},${g},${g - 80},0.5)`;
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 1, 3);
      }
    },
    repeat,
    repeat,
  );
}

/** 空のグラデーション（scene.background 用） */
export function makeSkyTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(4, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5aa9ea');
    g.addColorStop(0.6, '#a9d6f5');
    g.addColorStop(1, '#e8f3fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** 水滴のハイライト用の丸い光 */
export function makeGlowTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(220,245,255,0.6)');
    g.addColorStop(1, 'rgba(200,240,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
