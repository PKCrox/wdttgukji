import EventBus, { EVENTS } from './EventBus.js';
import { ensureStrategyMapOverlay } from './StrategyMapOverlay.js';

const DEFAULT_SLOT_KEY = 'autosave';
const SAVE_META_KEY = 'wdttgukji_save_meta';

function readSavePayload(slotKey = DEFAULT_SLOT_KEY) {
  const raw = window.localStorage.getItem(`wdttgukji_save_${slotKey}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default function installDebugBridge(game) {
  const getScene = (key) => {
    try {
      return game.scene.getScene(key);
    } catch {
      return null;
    }
  };

  const isActive = (key) => {
    try {
      return game.scene.isActive(key);
    } catch {
      return false;
    }
  };

  const getRegistry = () => {
    const scene = [
      getScene('WorldMap'),
      getScene('UIOverlay'),
      getScene('ActionPanel'),
      getScene('FactionSelect'),
      getScene('MainMenu'),
      getScene('Preloader'),
      getScene('Boot'),
    ].find((candidate) => candidate?.registry);
    return scene?.registry || null;
  };

  const stopScenes = (...keys) => {
    for (const key of keys) {
      if (isActive(key)) {
        game.scene.stop(key);
      }
    }
  };

  const getScenario = () => {
    const registry = getRegistry();
    return registry?.get('scenario') || game.cache?.json?.get('scenario-208') || null;
  };

  const getAllEvents = () => {
    const registry = getRegistry();
    return registry?.get('allEvents') || game.cache?.json?.get('all-events') || null;
  };

  const getGameplay = () => {
    const registry = getRegistry();
    return registry?.get('gameplay') || getScene('WorldMap')?.gameplay || null;
  };

  const getCurrentSceneKey = () => {
    if (isActive('Battle')) return 'Battle';
    if (isActive('ActionPanel')) return 'ActionPanel';
    if (isActive('WorldMap')) return 'WorldMap';
    if (isActive('FactionSelect')) return 'FactionSelect';
    if (isActive('MainMenu')) return 'MainMenu';
    if (isActive('Preloader')) return 'Preloader';
    if (isActive('Boot')) return 'Boot';
    return null;
  };

  const getRoute = () => {
    const currentScene = getCurrentSceneKey();
    switch (currentScene) {
      case 'MainMenu':
        return 'start';
      case 'FactionSelect':
        return 'faction';
      case 'WorldMap':
        return 'battlefield';
      case 'ActionPanel':
        return 'command';
      case 'Battle':
        return 'battle';
      case 'Preloader':
      case 'Boot':
        return 'loading';
      default:
        return 'unknown';
    }
  };

  const getCanvasMetrics = () => {
    const canvas = game.canvas;
    const rect = canvas?.getBoundingClientRect?.();
    return {
      width: rect?.width || 0,
      height: rect?.height || 0,
      top: rect?.top || 0,
      left: rect?.left || 0,
      right: rect?.right || 0,
      bottom: rect?.bottom || 0,
      internalWidth: canvas?.width || 0,
      internalHeight: canvas?.height || 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  };

  const getActionPanelState = () => {
    const panel = isActive('ActionPanel') ? getScene('ActionPanel') : null;
    return {
      open: !!panel,
      activeTab: panel?.activeTab || null,
      cityId: panel?.cityId || null,
      cityName: panel?.city?.name || null,
      bounds: panel
        ? {
            x: panel.panelX || 0,
            y: panel.panelY || 0,
            width: panel.panelW || 0,
            height: panel.panelH || 0,
          }
        : null,
    };
  };

  const getHudState = () => {
    const overlay = getScene('UIOverlay');
    return {
      turnText: overlay?.hudTurnText?.text || null,
      actionsText: overlay?.hudActionsText?.text || null,
      sidebarVisible: !!overlay?.sidebarBg?.visible,
      selectedCityId: overlay?.selectedCityId || null,
    };
  };

  const getSaveMeta = () => {
    try {
      return JSON.parse(window.localStorage.getItem(SAVE_META_KEY) || 'null');
    } catch {
      return null;
    }
  };

  const getStrategyMapState = () => {
    const overlay = window.__wdttgukjiStrategyMapOverlay || ensureStrategyMapOverlay();
    const root = document.querySelector('#wdttgukji-strategy-map-overlay');
    return {
      open: root?.dataset.open === 'true' || !!overlay?.isOpen?.(),
      context: root?.querySelector('[data-role="context"]')?.textContent || null,
    };
  };

  const getSnapshot = () => {
    const registry = getRegistry();
    const gameplay = getGameplay();
    const worldMap = getScene('WorldMap');
    return {
      ready: !!getCurrentSceneKey(),
      route: getRoute(),
      currentScene: getCurrentSceneKey(),
      activeScenes: game.scene.getScenes(true).map((scene) => scene.scene.key),
      selectedFaction: registry?.get('selectedFaction') || gameplay?.playerFaction || null,
      selectedCity: worldMap?.selectedCityId || null,
      zoomTier: worldMap?.zoomTier || null,
      actionPanel: getActionPanelState(),
      hud: getHudState(),
      turn: gameplay?.turn || null,
      year: gameplay?.year || null,
      month: gameplay?.month || null,
      actionsRemaining: gameplay?.actionsRemaining ?? null,
      saveMeta: getSaveMeta(),
      strategyMap: getStrategyMapState(),
      canvas: getCanvasMetrics(),
    };
  };

  const clearSaves = () => {
    for (const key of Object.keys(window.localStorage)) {
      if (key === 'game-save' || key === SAVE_META_KEY || key.startsWith('wdttgukji_save_')) {
        window.localStorage.removeItem(key);
      }
    }
    return true;
  };

  const startNewGame = () => {
    stopScenes('ActionPanel', 'Battle', 'UIOverlay', 'WorldMap', 'FactionSelect', 'MainMenu');
    game.scene.start('FactionSelect');
    return getSnapshot();
  };

  const selectFaction = (factionId) => {
    const registry = getRegistry();
    const scenario = getScenario();
    const allEvents = getAllEvents();
    if (!registry || !scenario) return null;

    registry.set('selectedFaction', factionId);
    registry.set('scenario', scenario);
    registry.set('allEvents', allEvents);
    registry.set('loadRequested', false);
    registry.set('loadSlotKey', null);
    stopScenes('ActionPanel', 'Battle', 'UIOverlay', 'WorldMap', 'FactionSelect', 'MainMenu');
    game.scene.start('WorldMap');
    return getSnapshot();
  };

  const loadGame = (slotKey = DEFAULT_SLOT_KEY) => {
    const payload = readSavePayload(slotKey);
    const registry = getRegistry();
    const scenario = getScenario();
    const allEvents = getAllEvents();
    if (!payload || !registry || !scenario) return false;

    registry.set('selectedFaction', payload.player?.factionId || null);
    registry.set('scenario', scenario);
    registry.set('allEvents', allEvents);
    registry.set('loadRequested', true);
    registry.set('loadSlotKey', slotKey);
    stopScenes('ActionPanel', 'Battle', 'UIOverlay', 'WorldMap', 'FactionSelect', 'MainMenu');
    game.scene.start('WorldMap');
    return true;
  };

  const selectCity = (cityId) => {
    const worldMap = getScene('WorldMap');
    if (!worldMap?.scenario) return null;

    const city = worldMap.gameplay?.state?.getCity(cityId) || worldMap.scenario.cities?.[cityId];
    if (!city) return null;
    worldMap.selectCity(cityId, city);
    return getSnapshot();
  };

  const openActionPanel = (cityId = null, activeTab = 'government') => {
    const worldMap = getScene('WorldMap');
    const targetCityId = cityId || worldMap?.selectedCityId;
    if (!worldMap || !targetCityId) return null;

    const city = worldMap.gameplay?.state?.getCity(targetCityId) || worldMap.scenario?.cities?.[targetCityId];
    if (!city) return null;
    worldMap.selectCity(targetCityId, city);
    EventBus.emit(EVENTS.OPEN_ACTION_PANEL, { cityId: targetCityId, city, activeTab });
    return getSnapshot();
  };

  const closeActionPanel = () => {
    const panel = getScene('ActionPanel');
    panel?.closePanel?.();
    return getSnapshot();
  };

  const advanceTurn = () => {
    const overlay = getScene('UIOverlay');
    overlay?.onEndTurn?.();
    return getSnapshot();
  };

  const openStrategyMap = () => {
    const overlay = window.__wdttgukjiStrategyMapOverlay || ensureStrategyMapOverlay();
    const selectedCity = getScene('WorldMap')?.selectedCityId;
    const city = selectedCity ? getGameplay()?.state?.getCity(selectedCity) || getScenario()?.cities?.[selectedCity] : null;
    overlay?.open?.(city ? `${city.name} 기준으로 방면과 수로, 관문 흐름을 함께 봅니다.` : '현재 전장의 방면과 수로, 관문 흐름을 함께 봅니다.');
    return getSnapshot();
  };

  const closeStrategyMap = () => {
    (window.__wdttgukjiStrategyMapOverlay || ensureStrategyMapOverlay())?.close?.();
    return getSnapshot();
  };

  const save = (slotKey = DEFAULT_SLOT_KEY) => {
    return !!getGameplay()?.save(slotKey);
  };

  const bridge = {
    version: 'phaser',
    isReady: () => !!getCurrentSceneKey() && getRoute() !== 'loading',
    getRoute,
    getCurrentScene: getCurrentSceneKey,
    getSceneKeys: () => game.scene.scenes.map((scene) => scene.scene.key),
    getActiveScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    getSelectedFaction: () => getSnapshot().selectedFaction,
    getSelectedCity: () => getSnapshot().selectedCity,
    isActionPanelOpen: () => getActionPanelState().open,
    getActionPanelTab: () => getActionPanelState().activeTab,
    getCanvasMetrics,
    getSaveMeta,
    getSnapshot,
    clearSaves,
    startNewGame,
    selectFaction,
    loadGame,
    selectCity,
    openActionPanel,
    closeActionPanel,
    advanceTurn,
    openStrategyMap,
    closeStrategyMap,
    save,
  };

  window.__wdttgukjiPhaser = bridge;
  return bridge;
}
