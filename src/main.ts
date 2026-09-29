import './style.css';
import { Game } from './Game';

const game = new Game(document.getElementById('game')!);
// 開発時のみコンソールから触れるようにする
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
