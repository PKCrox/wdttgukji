import Phaser from 'phaser';
import config from './config.js';
import installDebugBridge from './utils/installDebugBridge.js';
import { initLeaflet, invalidateLeafletSize, setLeafletVisible } from './utils/LeafletBridge.js';

const game = new Phaser.Game(config);

// Leaflet terrain tiles behind Phaser canvas
game.events.once('ready', () => {
  initLeaflet(game);
  setLeafletVisible(false); // 메뉴 화면에서는 숨김, WorldMap에서 표시

  // Sync Leaflet size on window resize
  window.addEventListener('resize', () => {
    invalidateLeafletSize();
  });
});

// 디버그용 — 브라우저 콘솔에서 window.game으로 접근 가능
window.game = game;
installDebugBridge(game);

export default game;
