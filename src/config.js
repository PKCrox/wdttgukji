import Phaser from 'phaser';
import UIPlugin from 'phaser3-rex-plugins/templates/ui/ui-plugin.js';

import BootScene from './scenes/BootScene.js';
import PreloaderScene from './scenes/PreloaderScene.js';
import MainMenuScene from './scenes/MainMenuScene.js';
import FactionSelectScene from './scenes/FactionSelectScene.js';
import WorldMapScene from './scenes/WorldMapScene.js';
import UIOverlayScene from './scenes/UIOverlayScene.js';
import ActionPanelScene from './scenes/ActionPanelScene.js';
import BattleScene from './scenes/BattleScene.js';

export default {
  type: Phaser.AUTO,
  parent: 'game',
  width: 1600,
  height: 900,
  backgroundColor: '#0a0a0f',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    PreloaderScene,
    MainMenuScene,
    FactionSelectScene,
    WorldMapScene,
    UIOverlayScene,
    ActionPanelScene,
    BattleScene,
  ],
  plugins: {
    scene: [
      {
        key: 'rexUI',
        plugin: UIPlugin,
        mapping: 'rexUI',
      },
    ],
  },
};
