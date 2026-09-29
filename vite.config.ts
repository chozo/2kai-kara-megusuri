import { defineConfig } from 'vite';

// 公開 URL は game.chozo.net/2kai-kara-megusuri/ 。
// 相対パス (base: './') で出力し、Workers のアセット配信パスに合わせて dist/2kai-kara-megusuri/ に置く
export const PUBLIC_PATH = '2kai-kara-megusuri';

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    outDir: `dist/${PUBLIC_PATH}`,
    emptyOutDir: true,
    // three.js 本体で 600kB 程度になるため警告閾値を上げる
    chunkSizeWarningLimit: 800,
  },
});
