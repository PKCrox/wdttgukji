import Phaser from 'phaser';
import config from './config.js';

const game = new Phaser.Game(config);

// 디버그용 — 브라우저 콘솔에서 window.game으로 접근 가능
window.game = game;

export default game;
