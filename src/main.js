import Phaser from 'phaser';
import config from './config.js';
import installDebugBridge from './utils/installDebugBridge.js';

const game = new Phaser.Game(config);

// 디버그용 — 브라우저 콘솔에서 window.game으로 접근 가능
window.game = game;
installDebugBridge(game);

export default game;
