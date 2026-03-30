import { resolveEnhancedCombat, chooseFormation } from '../../engine/core/enhanced-combat.js';
import { attemptCapture } from '../../engine/core/character-manager.js';
import {
  investTrack,
  previewInvestment,
  previewConscript,
  conscriptTroops,
  INVEST_BASE_COST,
  getCityForecast,
  getCityPolicy,
  CITY_DOMESTIC_POLICIES,
  CITY_MILITARY_POLICIES,
} from '../../engine/core/domestic.js';
import { calculateDiplomacyChance } from '../../engine/core/diplomacy.js';
import * as diplomacy from '../../engine/core/diplomacy.js';
import * as charMgr from '../../engine/core/character-manager.js';
import { getCharName } from './sidebar.js';
import { getItemName } from '../../engine/data/names.js';
import { startConstruction, getAvailableBuildings, BUILDINGS } from '../../engine/core/buildings.js';
import { getAvailableTechs, startResearch, getResearchStatus, TECHS } from '../../engine/core/tech-tree.js';
import { ESPIONAGE_ACTIONS, calculateEspionageChance, executeEspionage } from '../../engine/core/espionage.js';
import { moveArmy } from '../../engine/core/troop-movement.js';
import { previewFoodTransport, transportFood, previewFoodTrade, tradeFood, getTradeSeason } from '../../engine/core/logistics.js';
import { addExperienceFromSource } from '../../engine/core/growth.js';
import { ITEMS } from '../../engine/core/items.js';
import { COMMAND_SCENES, getFactionDoctrine, getFactionSealLabel, getFactionSurfaceTheme } from './presentation-meta.js';
import { getOpeningActBeat } from './campaign-config.js';
import { buildBattlefieldDirectorPacket, buildCommandDirectorPacket } from './turn-director.js';

const SCENE_ORDER = ['government', 'military', 'diplomacy', 'personnel'];

function joinCopyParts(...parts) {
  return parts
    .map((part) => `${part || ''}`.trim())
    .filter(Boolean)
    .join(' ');
}

export class ActionPanel {
  constructor() {
    this.modal = document.getElementById('command-modal');
    this.panel = document.getElementById('action-panel');
    this.contentArea = document.getElementById('action-panel-content');
    this.stageStrip = document.getElementById('command-stage-strip');
    this.buttons = document.getElementById('action-buttons');
    this.tabBar = document.getElementById('action-tab-bar');
    this.titleEl = document.getElementById('action-panel-title');
    this.captionEl = document.getElementById('command-city-caption');
    this.bridgeEl = document.getElementById('command-bridge');
    this.summaryEl = document.getElementById('command-city-summary');
    this.sheetSurfaceEl = document.getElementById('command-sheet-surface');
    this.candidateSheetEl = document.getElementById('command-candidate-sheet');
    this.candidateTitleEl = document.getElementById('command-candidate-title');
    this.candidateCopyEl = document.getElementById('command-candidate-copy');
    this.candidateBadgeEl = document.getElementById('command-candidate-badge');
    this.candidateLiveEl = document.getElementById('command-candidate-live');
    this.sheetBodyEl = document.getElementById('command-sheet-body');
    this.previewEl = document.getElementById('command-preview');
    this.sealDocketEl = document.getElementById('command-seal-docket');
    this.selectionStatusEl = document.getElementById('command-selection-status');
    this.keyHintEl = document.getElementById('command-key-hint');
    this.confirmButton = document.getElementById('action-panel-confirm');
    this.cancelButton = document.getElementById('action-panel-cancel');
    this.onAction = null;
    this._connections = [];
    this._activeScene = null;
    this._cityId = null;
    this._state = null;
    this._pendingAction = null;
    this._previewAction = null;
    this._entries = [];
    this._openingContext = { active: false, turn: 1, factionId: null };
    this._previewTransitionTimer = null;
    this._sceneTransitionTimer = null;
    this._visibleScenes = [];
    this._recommendedScene = null;
    this._sectionButtons = [];
    this._sceneSections = [];
    this._sectionResetButton = null;
    this._focusedSectionId = null;
    this._primeSelectionOnNextRender = false;
    this._activeDirector = null;
    this._activeBattlefieldDirector = null;

    document.getElementById('action-panel-close').addEventListener('click', () => this.hide());
    document.getElementById('command-modal-backdrop').addEventListener('click', () => this.hide());
    this.confirmButton?.addEventListener('click', () => {
      if (this._pendingAction) this.confirmSelection();
      else this._promotePreviewAction();
    });
    this.cancelButton?.addEventListener('click', () => this.cancelSelection());
    this.buttons?.addEventListener('scroll', () => this._syncSceneSectionRail());
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelSelection();
      } else if (this._isRecommendedSceneEvent(e)) {
        if (!this._recommendedScene || this._recommendedScene === this._activeScene) return;
        e.preventDefault();
        this._activeScene = this._recommendedScene;
        this._pendingAction = null;
        this._previewAction = null;
        this._primeSelectionOnNextRender = true;
        this._render(this._cityId, this._state);
      } else if (this._isSectionCycleEvent(e)) {
        const direction = e.key === 'ArrowRight' ? 1 : -1;
        if (!this._stepSection(direction)) return;
        e.preventDefault();
      } else if (this._isSceneCycleEvent(e)) {
        const direction = e.key === 'ArrowRight' ? 1 : -1;
        if (!this._stepScene(direction)) return;
        e.preventDefault();
      } else if (this._isSceneHotkeyEvent(e)) {
        const sceneIndex = Number.parseInt(e.key, 10) - 1;
        const sceneId = this._visibleScenes[sceneIndex];
        if (!sceneId || sceneId === this._activeScene) return;
        e.preventDefault();
        this._activeScene = sceneId;
        this._pendingAction = null;
        this._previewAction = null;
        this._primeSelectionOnNextRender = true;
        this._render(this._cityId, this._state);
      } else if (this._isEntryCycleEvent(e)) {
        const direction = e.key === 'ArrowDown' ? 1 : -1;
        if (!this._stepEntry(direction)) return;
        e.preventDefault();
      } else if (e.key === 'Enter' && this._pendingAction && !this.confirmButton.disabled) {
        e.preventDefault();
        this.confirmSelection();
      } else if (e.key === 'Enter' && this._previewAction) {
        e.preventDefault();
        this._promotePreviewAction();
      }
    });
  }

  show(cityId, state) {
    this.open(cityId, state);
  }

  setConnections(connections) {
    this._connections = connections || [];
  }

  setContext(cityId, state) {
    const previousCityId = this._cityId;
    this._cityId = cityId;
    this._state = state;
    if (!this.isOpen()) return;
    if (!cityId || !state?.cities?.[cityId]) {
      this.hide();
      return;
    }
    this._pendingAction = null;
    this._previewAction = null;
    if (previousCityId !== cityId) {
      this._activeScene = this._getDefaultSceneForCity(cityId, state);
      this._primeSelectionOnNextRender = true;
    }
    this._render(cityId, state);
  }

  setOpeningContext(context = {}) {
    this._openingContext = {
      active: !!context.active,
      turn: context.turn || 1,
      factionId: context.factionId || null,
    };
  }

  open(cityId = this._cityId, state = this._state, sceneKey = null) {
    if (!cityId || !state?.cities?.[cityId]) return false;
    const previousCityId = this._cityId;
    this._cityId = cityId;
    this._state = state;
    const openingScene = this._openingContext.active && this._openingContext.factionId
      ? getOpeningActBeat(this._openingContext.factionId, this._openingContext.turn)?.preferredScene
      : null;
    this._activeScene = sceneKey
      || openingScene
      || (previousCityId !== cityId ? this._getDefaultSceneForCity(cityId, state) : this._activeScene);
    this._pendingAction = null;
    this._previewAction = null;
    this._primeSelectionOnNextRender = true;
    this._render(cityId, state);
    this.modal.classList.remove('hidden');
    return true;
  }

  hide() {
    this.modal.classList.add('hidden');
    this.modal.dataset.playerFaction = 'neutral';
    this._pendingAction = null;
    this._previewAction = null;
    this._entries = [];
    clearTimeout(this._previewTransitionTimer);
    clearTimeout(this._sceneTransitionTimer);
    this.previewEl?.classList.remove('preview-transition');
    this.contentArea?.classList.remove('scene-switching');
    this.buttons?.classList.remove('scene-switching');
    this.tabBar?.classList.remove('scene-switching');
    this._setStageMode('sheet');
    this._visibleScenes = [];
    this._recommendedScene = null;
    this._sectionButtons = [];
    this._sceneSections = [];
    this._sectionResetButton = null;
    this._focusedSectionId = null;
    this._primeSelectionOnNextRender = false;
    this._activeDirector = null;
    this._activeBattlefieldDirector = null;
    if (this.bridgeEl) this.bridgeEl.innerHTML = '';
    if (this.sheetBodyEl) delete this.sheetBodyEl.dataset.state;
    if (this.sheetSurfaceEl) delete this.sheetSurfaceEl.dataset.state;
    if (this.sheetSurfaceEl) delete this.sheetSurfaceEl.dataset.scene;
    if (this.candidateSheetEl) delete this.candidateSheetEl.dataset.state;
    if (this.candidateSheetEl) delete this.candidateSheetEl.dataset.scene;
    if (this.buttons) delete this.buttons.dataset.state;
    if (this.buttons) delete this.buttons.dataset.scene;
    if (this.sealDocketEl) this.sealDocketEl.innerHTML = '';
    if (this.candidateTitleEl) {
      this.candidateTitleEl.textContent = '카드를 고르면 턴 결정이 바로 확정 대기 상태로 올라옵니다';
    }
    if (this.candidateCopyEl) {
      this.candidateCopyEl.textContent = '핵심 카드 하나를 눌러 이번 턴 결정을 올리고, 같은 패널에서 바로 확정합니다.';
    }
    if (this.candidateBadgeEl) {
      this.candidateBadgeEl.textContent = '선택 대기';
    }
    if (this.candidateLiveEl) this.candidateLiveEl.innerHTML = '';
  }

  isOpen() {
    return !this.modal.classList.contains('hidden');
  }

  cancelSelection() {
    if (this._pendingAction) {
      this._pendingAction = null;
      this._previewAction = null;
      this._refreshSelectionUI();
      return;
    }
    if (this._previewAction) {
      this._previewAction = null;
      this._refreshSelectionUI();
      return;
    }
    this.hide();
  }

  _promotePreviewAction() {
    if (!this._previewAction || this._previewAction.disabled) return false;
    this._pendingAction = this._previewAction;
    this._refreshSelectionUI();
    return true;
  }

  _jumpToStage(stage) {
    if (stage === 'brief') {
      if (!this._pendingAction && !this._previewAction && !this._focusedSectionId) return false;
      this._pendingAction = null;
      this._previewAction = null;
      if (this._focusedSectionId) {
        this._focusedSectionId = null;
        const scene = this.buttons?.querySelector('.command-scene');
        if (scene instanceof HTMLElement) {
          this._applySectionFocus(scene);
          this._syncSceneSectionRail();
        }
      }
      this._refreshSelectionUI();
      return true;
    }
    if (stage === 'preview') {
      if (this._pendingAction) {
        this._previewAction = this._pendingAction;
        this._pendingAction = null;
      } else {
        if (this._previewAction) return false;
        const firstEntry = this._getFirstSelectableEntry();
        if (!firstEntry) return false;
        this._previewAction = firstEntry;
      }
      this._refreshSelectionUI();
      return true;
    }
    if (stage === 'decision') {
      if (this._pendingAction) return false;
      return this._promotePreviewAction();
    }
    return false;
  }

  confirmSelection() {
    if (!this._pendingAction || !this.onAction) return false;
    const success = this.onAction(this._pendingAction.actionType, this._pendingAction.params);
    if (success === false) return false;
    this._pendingAction = null;
    this._previewAction = null;
    this._primeSelectionOnNextRender = false;
    if (this.isOpen() && this._cityId && this._state?.cities?.[this._cityId]) {
      this._render(this._cityId, this._state);
    }
    return true;
  }

  switchScene(sceneKey) {
    if (!sceneKey || !this._cityId || !this._state?.cities?.[this._cityId]) return false;
    const city = this._state.cities[this._cityId];
    const scenes = city.owner === this._state.player.factionId
      ? SCENE_ORDER
      : SCENE_ORDER.filter((sceneId) => sceneId !== 'government' && sceneId !== 'personnel');
    if (!scenes.includes(sceneKey)) return false;
    this._activeScene = sceneKey;
    this._pendingAction = null;
    this._previewAction = null;
    this._primeSelectionOnNextRender = true;
    if (this.isOpen()) this._render(this._cityId, this._state);
    return true;
  }

  _seedDecisionSelection() {
    if (!this._primeSelectionOnNextRender || this._pendingAction || this._previewAction) {
      this._primeSelectionOnNextRender = false;
      return;
    }
    const firstEntry = this._getFirstSelectableEntry();
    if (firstEntry) {
      this._pendingAction = firstEntry;
      this._previewAction = firstEntry;
    }
    this._primeSelectionOnNextRender = false;
  }

  _render(cityId, state) {
    const city = state.cities[cityId];
    if (!city) return this.hide();

    const playerFactionId = state.player.factionId;
    const theme = getFactionSurfaceTheme(playerFactionId);
    const isOwned = city.owner === playerFactionId;
    const scenes = isOwned
      ? SCENE_ORDER
      : SCENE_ORDER.filter(scene => scene !== 'government' && scene !== 'personnel');
    const activeScene = scenes.includes(this._activeScene) ? this._activeScene : scenes[0];
    const sceneChanged = activeScene !== this.panel.dataset.scene;
    const sceneMeta = COMMAND_SCENES[activeScene];
    const ownerName = city.owner ? state.factions[city.owner]?.name || '' : '무주지';
    const forecast = getCityForecast(cityId, state);
    const recommendedScene = this._getRecommendedSceneForCity(cityId, state, scenes);
    const director = buildCommandDirectorPacket({
      cityId,
      sceneId: activeScene,
      state,
      connections: this._connections,
    });
    const battlefieldDirector = buildBattlefieldDirectorPacket({
      cityId,
      state,
      scenario: { connections: this._connections },
    });

    this._activeScene = activeScene;
    this._activeDirector = director;
    this._activeBattlefieldDirector = battlefieldDirector;
    this._visibleScenes = scenes;
    this._recommendedScene = recommendedScene;
    this._entries = [];
    this.modal.dataset.playerFaction = theme.id;
    this.panel.dataset.scene = activeScene;
    this.contentArea.dataset.scene = activeScene;
    this.buttons.dataset.scene = activeScene;
    this.previewEl.dataset.scene = activeScene;

    this.titleEl.innerHTML = `
      <span class="command-scene-kicker">${theme.commandKicker} · ${sceneMeta.kicker}</span>
      <span class="command-scene-title-line">
        <span>${city.name} ${sceneMeta.name}</span>
      </span>
    `;
    this.captionEl.textContent = director.subhead || (isOwned ? sceneMeta.captionOwned : sceneMeta.captionForeign);
    if (this.bridgeEl) {
      this.bridgeEl.innerHTML = renderCommandBridge({
        city,
        sceneId: activeScene,
        director,
        battlefieldDirector,
        recommendedScene,
      });
      this.bridgeEl.dataset.scene = activeScene;
      this.bridgeEl.dataset.tone = isOwned ? 'own' : city.owner ? 'hostile' : 'neutral';
    }
    this.summaryEl.innerHTML = renderCommandSummary(city, ownerName, forecast, state, director);
    this.summaryEl.dataset.scene = activeScene;
    this.summaryEl.dataset.tone = isOwned ? 'own' : city.owner ? 'hostile' : 'neutral';
    this.tabBar.innerHTML = '';
    this.buttons.innerHTML = '';

    scenes.forEach((sceneId, sceneIndex) => {
      const meta = COMMAND_SCENES[sceneId];
      const button = document.createElement('button');
      button.className = `scene-nav-button${sceneId === activeScene ? ' active' : ''}`;
      button.innerHTML = `
        <span class="scene-nav-topline">
          <span class="scene-nav-name">
            <span class="scene-nav-hotkey">${sceneIndex + 1}</span>
            <span>${meta.name}</span>
          </span>
          ${sceneId === recommendedScene ? '<span class="scene-nav-badge">권장 · R</span>' : ''}
        </span>
        <span class="scene-nav-kicker">${meta.kicker}</span>
      `;
      button.addEventListener('click', () => {
        this._activeScene = sceneId;
        this._pendingAction = null;
        this._previewAction = null;
        this._primeSelectionOnNextRender = true;
        this._render(cityId, state);
      });
      this.tabBar.appendChild(button);
    });

    const scene = document.createElement('div');
    scene.className = `command-scene command-scene-${activeScene}`;
    switch (activeScene) {
      case 'government':
        this._buildGovernmentScene(scene, cityId, state);
        break;
      case 'military':
        this._buildMilitaryScene(scene, cityId, state);
        break;
      case 'diplomacy':
        this._buildDiplomacyScene(scene, cityId, state);
        break;
      case 'personnel':
        this._buildPersonnelScene(scene, cityId, state);
        break;
      default:
        break;
    }
    this.buttons.appendChild(scene);
    this._mountSceneSectionRail(scene);
    this._seedDecisionSelection();
    if (sceneChanged) {
      clearTimeout(this._sceneTransitionTimer);
      this.contentArea.classList.remove('scene-switching');
      this.buttons.classList.remove('scene-switching');
      this.tabBar.classList.remove('scene-switching');
      void this.buttons.offsetWidth;
      this.contentArea.classList.add('scene-switching');
      this.buttons.classList.add('scene-switching');
      this.tabBar.classList.add('scene-switching');
      this._sceneTransitionTimer = setTimeout(() => {
        this.contentArea?.classList.remove('scene-switching');
        this.buttons?.classList.remove('scene-switching');
        this.tabBar?.classList.remove('scene-switching');
      }, 320);
    }
    this._refreshSelectionUI();
  }

  _getDefaultSceneForCity(cityId, state) {
    const city = state?.cities?.[cityId];
    if (!city) return this._activeScene || 'military';
    return city.owner === state?.player?.factionId ? 'government' : 'military';
  }

  _isSceneHotkeyEvent(event) {
    if (!/^[1-4]$/.test(event.key)) return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    if (target.closest('input, textarea, select, button, [contenteditable="true"]')) return false;
    return true;
  }

  _isSceneCycleEvent(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    if (target.closest('input, textarea, select, button, [contenteditable="true"]')) return false;
    return true;
  }

  _isRecommendedSceneEvent(event) {
    if (event.key.toLowerCase() !== 'r') return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    if (target.closest('input, textarea, select, button, [contenteditable="true"]')) return false;
    return true;
  }

  _isEntryCycleEvent(event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return false;
    return true;
  }

  _isSectionCycleEvent(event) {
    if (!event.shiftKey) return false;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return true;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return false;
    return true;
  }

  _stepScene(direction) {
    if (this._visibleScenes.length < 2) return false;
    const currentIndex = this._visibleScenes.indexOf(this._activeScene);
    if (currentIndex === -1) return false;
    const nextIndex = (currentIndex + direction + this._visibleScenes.length) % this._visibleScenes.length;
    const nextScene = this._visibleScenes[nextIndex];
    if (!nextScene || nextScene === this._activeScene) return false;
    this._activeScene = nextScene;
    this._pendingAction = null;
    this._previewAction = null;
    this._primeSelectionOnNextRender = true;
    this._render(this._cityId, this._state);
    return true;
  }

  _stepEntry(direction) {
    const selectableEntries = this._entries.filter((entry) => (
      !entry.disabled && (!this._focusedSectionId || entry.sectionId === this._focusedSectionId)
    ));
    if (!selectableEntries.length) return false;
    const currentKey = this._pendingAction?.key || this._previewAction?.key;
    const currentIndex = selectableEntries.findIndex((entry) => entry.key === currentKey);
    const fallbackIndex = direction < 0 ? selectableEntries.length - 1 : 0;
    const nextIndex = currentIndex >= 0
      ? (currentIndex + direction + selectableEntries.length) % selectableEntries.length
      : fallbackIndex;
    if (this._pendingAction) {
      this._pendingAction = selectableEntries[nextIndex];
    } else {
      this._previewAction = selectableEntries[nextIndex];
    }
    this._refreshSelectionUI();
    return true;
  }

  _getFirstSelectableEntry() {
    return this._entries.find((entry) => (
      !entry.disabled && (!this._focusedSectionId || entry.sectionId === this._focusedSectionId)
    )) || null;
  }

  _activateSection(section, behavior = 'smooth') {
    if (!(section instanceof HTMLElement)) return false;
    section.scrollIntoView({ block: 'start', behavior });
    const firstCommandKey = section.dataset.firstCommandKey;
    if (firstCommandKey) {
      const firstEntry = this._entries.find((entry) => entry.key === firstCommandKey);
      if (firstEntry) {
        this._pendingAction = firstEntry;
        this._refreshSelectionUI();
      }
    }
    this._setActiveSectionRail(section.dataset.sectionId || '');
    return true;
  }

  _stepSection(direction) {
    if (this._sceneSections.length < 2) return false;
    this._syncSceneSectionRail();
    const activeId = this._sectionButtons.find((button) => button.classList.contains('active'))?.dataset.sectionId;
    const currentIndex = Math.max(0, this._sceneSections.findIndex((section) => section.dataset.sectionId === activeId));
    const nextIndex = (currentIndex + direction + this._sceneSections.length) % this._sceneSections.length;
    return this._activateSection(this._sceneSections[nextIndex]);
  }

  _mountSceneSectionRail(scene) {
    const hero = scene.querySelector('.scene-hero');
    const sections = Array.from(scene.querySelectorAll('.command-scene-section[data-section-id]'));
    scene.querySelector('.command-scene-section-rail')?.remove();
    this._sceneSections = sections;
    this._sectionButtons = [];
    this._sectionResetButton = null;
    if (sections.length < 2) return;

    const rail = document.createElement('div');
    rail.className = 'command-scene-section-rail';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'command-scene-section-jump command-scene-section-jump-reset';
    resetButton.innerHTML = `
      <span class="command-scene-section-jump-title">전체 보기</span>
      <span class="command-scene-section-jump-count">모든 묶음</span>
    `;
    resetButton.addEventListener('click', () => {
      this._focusedSectionId = null;
      this._applySectionFocus(scene);
      this._syncSceneSectionRail();
    });
    rail.appendChild(resetButton);
    this._sectionResetButton = resetButton;

    sections.forEach((section) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-scene-section-jump';
      button.dataset.sectionId = section.dataset.sectionId || '';
      button.innerHTML = `
        <span class="command-scene-section-jump-title">${section.dataset.sectionTitle || '섹션'}</span>
        <span class="command-scene-section-jump-count">${section.dataset.sectionCount || '0개'}</span>
      `;
      button.addEventListener('click', () => {
        this._focusedSectionId = section.dataset.sectionId || null;
        this._applySectionFocus(scene);
        this._activateSection(section);
      });
      rail.appendChild(button);
    });

    if (hero?.nextSibling) scene.insertBefore(rail, hero.nextSibling);
    else scene.prepend(rail);
    this._sectionButtons = Array.from(rail.querySelectorAll('.command-scene-section-jump[data-section-id]'));
    this._applySectionFocus(scene);
    requestAnimationFrame(() => this._syncSceneSectionRail());
  }

  _applySectionFocus(scene) {
    if (!(scene instanceof HTMLElement)) return;
    const focusedSection = this._focusedSectionId
      ? this._sceneSections.find((section) => section.dataset.sectionId === this._focusedSectionId)
      : null;
    if (this._focusedSectionId && !focusedSection) {
      this._focusedSectionId = null;
    }
    const focusActive = !!this._focusedSectionId;
    scene.classList.toggle('section-focus-mode', focusActive);
    this._sceneSections.forEach((section) => {
      section.classList.toggle('hidden-by-focus', focusActive && section.dataset.sectionId !== this._focusedSectionId);
    });
    this._sectionButtons.forEach((button) => {
      button.classList.toggle('locked', focusActive && button.dataset.sectionId === this._focusedSectionId);
    });
    this._sectionResetButton?.classList.toggle('locked', !focusActive);
  }

  _setActiveSectionRail(sectionId) {
    this._sectionButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.sectionId === sectionId);
    });
  }

  _syncSceneSectionRail() {
    if (!this.isOpen() || !this._sectionButtons.length || !this._sceneSections.length || !this.buttons) return;
    if (this._focusedSectionId) {
      this._setActiveSectionRail(this._focusedSectionId);
      return;
    }
    const containerRect = this.buttons.getBoundingClientRect();
    let activeId = this._sceneSections[0]?.dataset.sectionId || '';
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const section of this._sceneSections) {
      const distance = Math.abs((section.getBoundingClientRect().top - containerRect.top) - 76);
      if (distance < bestDistance) {
        bestDistance = distance;
        activeId = section.dataset.sectionId || activeId;
      }
    }
    this._setActiveSectionRail(activeId);
  }

  _getSceneHotkeyHint() {
    if (!this._visibleScenes.length) return '';
    const lastIndex = Math.min(this._visibleScenes.length, 4);
    return `
      <span class="command-key-chip command-key-chip-scene">
        <kbd>1-${lastIndex}</kbd>
        <strong>장면 전환</strong>
      </span>
      ${this._visibleScenes.length > 1 ? `
        <span class="command-key-chip command-key-chip-scene">
          <kbd>← →</kbd>
          <strong>장면 순환</strong>
        </span>
      ` : ''}
      ${this._recommendedScene ? `
        <span class="command-key-chip command-key-chip-scene">
          <kbd>R</kbd>
          <strong>권장 장면</strong>
        </span>
      ` : ''}
    `;
  }

  _getEntryHotkeyHint() {
    return this._entries.some((entry) => !entry.disabled)
      ? `
        <span class="command-key-chip command-key-chip-scene">
          <kbd>↑ ↓</kbd>
          <strong>${this._pendingAction ? '결정 이동' : '후보 이동'}</strong>
        </span>
      `
      : '';
  }

  _setStageMode(mode = 'sheet') {
    if (!this.stageStrip) return;
    this.stageStrip.dataset.mode = mode;
    this.stageStrip.classList.toggle('decision-mode', mode === 'decision');
  }

  _updateStageStripCopy(sceneMeta) {
    if (!this.stageStrip) return;
    const cityCopy = this.stageStrip.querySelector('[data-stage-copy="city"]');
    const readoutCopy = this.stageStrip.querySelector('[data-stage-copy="readout"]');
    const decisionCopy = this.stageStrip.querySelector('[data-stage-copy="decision"]');
    const cityName = this._cityId && this._state?.cities?.[this._cityId]?.name
      ? this._state.cities[this._cityId].name
      : '';
    const cityText = cityName
      ? `${cityName} · ${sceneMeta?.name || '명령'}`
      : '도시 선택 대기';
    const readoutText = truncateBridgeLine(this.captionEl?.textContent || '전선 판독 대기', 52);
    const decisionText = (this._pendingAction || this._previewAction || this._getFirstSelectableEntry())?.title
      || `${sceneMeta?.name || '명령'} 선택 대기`;
    if (cityCopy instanceof HTMLElement) cityCopy.textContent = cityText;
    if (readoutCopy instanceof HTMLElement) readoutCopy.textContent = readoutText;
    if (decisionCopy instanceof HTMLElement) decisionCopy.textContent = decisionText;
  }

  _getSectionHotkeyHint() {
    return this._sceneSections.length > 1
      ? `
        <span class="command-key-chip command-key-chip-scene">
          <kbd>Shift + ← →</kbd>
          <strong>섹션 이동</strong>
        </span>
      `
      : '';
  }

  _getRecommendedSceneForCity(cityId, state, scenes = SCENE_ORDER) {
    const city = state?.cities?.[cityId];
    if (!city) return scenes[0] || 'military';

    const openingScene = this._openingContext.active && this._openingContext.factionId === state?.player?.factionId
      ? getOpeningActBeat(this._openingContext.factionId, this._openingContext.turn)?.preferredScene
      : null;
    if (openingScene && scenes.includes(openingScene)) return openingScene;

    const isOwned = city.owner === state?.player?.factionId;
    if (!isOwned) {
      if (!city.owner) return scenes.includes('military') ? 'military' : scenes[0];
      return state.isAtWar(state.player.factionId, city.owner) && scenes.includes('military')
        ? 'military'
        : scenes.includes('diplomacy')
          ? 'diplomacy'
          : scenes[0];
    }

    return this._getEnemyNeighbors(cityId, state).length > 0 && scenes.includes('military')
      ? 'military'
      : scenes.includes('government')
        ? 'government'
        : scenes[0];
  }

  _refreshSelectionUI() {
    const activeKey = this._pendingAction?.key;
    const previewKey = !this._pendingAction ? this._previewAction?.key : null;
    this.buttons.querySelectorAll('[data-command-key]').forEach((node) => {
      node.classList.toggle('selected', node.dataset.commandKey === activeKey);
      node.classList.toggle('previewing', !!previewKey && node.dataset.commandKey === previewKey);
    });
    const focusedNode = activeKey || previewKey
      ? this.buttons.querySelector(`[data-command-key="${activeKey || previewKey}"]`)
      : null;
    if (focusedNode instanceof HTMLElement) {
      const fold = focusedNode.closest('details');
      if (fold instanceof HTMLDetailsElement) fold.open = true;
      focusedNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    const sceneMeta = COMMAND_SCENES[this._activeScene];
    const sceneHotkeyHint = this._getSceneHotkeyHint();
    const sectionHotkeyHint = this._getSectionHotkeyHint();
    const entryHotkeyHint = this._getEntryHotkeyHint();
    const selectableEntries = this._entries.filter((entry) => (
      !entry.disabled && (!this._focusedSectionId || entry.sectionId === this._focusedSectionId)
    ));
    const city = this._cityId && this._state?.cities?.[this._cityId]
      ? this._state.cities[this._cityId]
      : null;
    const recommendedSceneMeta = COMMAND_SCENES[this._recommendedScene] || null;
    const sheetMode = this._pendingAction ? 'decision' : this._previewAction ? 'preview' : 'brief';
    this._setStageMode(this._pendingAction ? 'decision' : 'sheet');
    this._updateStageStripCopy(sceneMeta);
    if (this.sealDocketEl) {
      this.sealDocketEl.innerHTML = renderCommandSealDocket({
        city,
        sceneMeta,
        director: this._activeDirector,
        battlefieldDirector: this._activeBattlefieldDirector,
        recommendedSceneMeta,
        pendingAction: this._pendingAction,
        previewAction: this._previewAction,
        actionsRemaining: this._state?.actionsRemaining ?? 0,
      });
      this.sealDocketEl.dataset.state = sheetMode;
    }
    if (this.sheetSurfaceEl) {
      this.sheetSurfaceEl.dataset.state = sheetMode;
      this.sheetSurfaceEl.dataset.scene = this._activeScene || 'neutral';
    }
    if (this.candidateSheetEl) {
      this.candidateSheetEl.dataset.state = sheetMode;
      this.candidateSheetEl.dataset.scene = this._activeScene || 'neutral';
    }
    if (this.sheetBodyEl) this.sheetBodyEl.dataset.state = sheetMode;
    if (this.buttons) this.buttons.dataset.state = sheetMode;
    if (this.buttons) this.buttons.dataset.scene = this._activeScene || 'neutral';
    const focusEntry = this._pendingAction || this._previewAction || selectableEntries[0] || null;
    if (this.candidateLiveEl) {
      this.candidateLiveEl.innerHTML = renderCommandCandidateLive({
        mode: sheetMode,
        sceneId: this._activeScene,
        sceneMeta,
        city,
        entry: focusEntry,
        actionsRemaining: this._state?.actionsRemaining ?? 0,
        selectableCount: selectableEntries.length,
        director: this._activeDirector,
        battlefieldDirector: this._activeBattlefieldDirector,
        recommendedSceneMeta,
      });
      this.candidateLiveEl.dataset.state = sheetMode;
    }
    if (this.candidateTitleEl) {
      this.candidateTitleEl.textContent = this._pendingAction
        ? `${focusEntry?.title || sceneMeta?.name || '명령'}이 이번 턴 확정 대기 상태로 올라와 있습니다`
        : this._previewAction
          ? `${focusEntry?.title || sceneMeta?.name || '명령'} 후보가 시트에 올라왔습니다`
          : `${sceneMeta?.name || '명령'} 카드에서 이번 턴 결정을 고릅니다`;
    }
    if (this.candidateCopyEl) {
      this.candidateCopyEl.textContent = this._pendingAction
        ? '다른 카드를 누르면 현재 선택이 즉시 교체됩니다. Enter나 하단 결정 버튼으로 바로 이번 턴에 반영됩니다.'
        : this._previewAction
          ? '후보가 오른쪽 결정 패널에 실시간으로 반영됐습니다. Enter를 누르거나 한 번 더 선택해 확정 대기로 올립니다.'
          : `${selectableEntries.length || 0}개 후보 중 핵심 카드부터 먼저 노출됩니다. 카드 하나를 누르면 오른쪽 패널이 바로 확정 단계로 전환됩니다.`;
    }
    if (this.candidateBadgeEl) {
      this.candidateBadgeEl.textContent = this._pendingAction
        ? '즉시 확정'
        : this._previewAction
          ? '후보 확인'
          : `${selectableEntries.length || 0}개 카드`;
    }
    if (this._pendingAction) {
      const tone = getCommandPreviewTone(this._pendingAction);
      const confirmLabel = `${formatConfirmActionLabel(this._pendingAction.title)} 확정`;
      this.previewEl.innerHTML = renderCommandSheetPreview({
        mode: 'decision',
        sceneMeta,
        sceneId: this._activeScene,
        cityId: this._cityId,
        state: this._state,
        connections: this._connections,
        entry: this._pendingAction,
      });
      this.selectionStatusEl.innerHTML = renderCommandSelectionStatus({
        mode: 'decision',
        sceneMeta,
        city,
        entry: this._pendingAction,
        tone,
        actionsRemaining: this._state?.actionsRemaining ?? 0,
        director: this._activeDirector,
        battlefieldDirector: this._activeBattlefieldDirector,
        recommendedSceneMeta,
      });
      if (this.keyHintEl) {
        this.keyHintEl.innerHTML = `
          ${sceneHotkeyHint}
          ${sectionHotkeyHint}
          ${entryHotkeyHint}
          <span class="command-key-chip"><kbd>Enter</kbd><strong>${confirmLabel}</strong></span>
          <span class="command-key-chip"><kbd>클릭</kbd><strong>다른 결정 고르기</strong></span>
          <span class="command-key-chip"><kbd>Esc</kbd><strong>선택 해제</strong></span>
        `;
        this.keyHintEl.dataset.mode = 'decision';
      }
      this.confirmButton.disabled = !!this._pendingAction.disabled;
      this.confirmButton.innerHTML = renderFooterButtonLabel(confirmLabel, 'Enter');
      this.confirmButton.title = this._pendingAction.title;
      this.cancelButton.innerHTML = renderFooterButtonLabel('선택 해제', 'Esc');
    } else if (this._previewAction) {
      const tone = getCommandPreviewTone(this._previewAction);
      this.previewEl.innerHTML = renderCommandSheetPreview({
        mode: 'preview',
        sceneMeta,
        sceneId: this._activeScene,
        cityId: this._cityId,
        state: this._state,
        connections: this._connections,
        entry: this._previewAction,
      });
      this.selectionStatusEl.innerHTML = renderCommandSelectionStatus({
        mode: 'preview',
        sceneMeta,
        city,
        entry: this._previewAction,
        tone,
        actionsRemaining: this._state?.actionsRemaining ?? 0,
        director: this._activeDirector,
        battlefieldDirector: this._activeBattlefieldDirector,
        recommendedSceneMeta,
      });
      if (this.keyHintEl) {
        this.keyHintEl.innerHTML = `
          ${sceneHotkeyHint}
          ${sectionHotkeyHint}
          ${entryHotkeyHint}
          <span class="command-key-chip"><kbd>Enter</kbd><strong>이 결정 올리기</strong></span>
          <span class="command-key-chip"><kbd>클릭</kbd><strong>후보 교체</strong></span>
          <span class="command-key-chip"><kbd>Esc</kbd><strong>시트 닫기</strong></span>
          <span class="command-key-copy">왼쪽 카드가 결정 패널을 즉시 바꿉니다.</span>
        `;
        this.keyHintEl.dataset.mode = 'sheet';
      }
      this.confirmButton.disabled = false;
      this.confirmButton.innerHTML = renderFooterButtonLabel('이 결정 올리기', 'Enter');
      this.confirmButton.title = `${this._previewAction.title} 선택`;
      this.cancelButton.innerHTML = renderFooterButtonLabel('시트 닫기', 'Esc');
    } else {
      this.previewEl.innerHTML = renderCommandSheetPreview({
        mode: 'brief',
        sceneMeta,
        sceneId: this._activeScene,
        cityId: this._cityId,
        state: this._state,
        connections: this._connections,
      });
      this.selectionStatusEl.innerHTML = renderCommandSelectionStatus({
        mode: 'brief',
        sceneMeta,
        city,
        tone: 'brief',
        actionsRemaining: this._state?.actionsRemaining ?? 0,
        director: this._activeDirector,
        battlefieldDirector: this._activeBattlefieldDirector,
        recommendedSceneMeta,
      });
      if (this.keyHintEl) {
        this.keyHintEl.innerHTML = `
          ${sceneHotkeyHint}
          ${sectionHotkeyHint}
          ${entryHotkeyHint}
          <span class="command-key-chip"><kbd>클릭</kbd><strong>후보 선택</strong></span>
          <span class="command-key-chip"><kbd>두 번</kbd><strong>카드 즉시 확정</strong></span>
          <span class="command-key-chip"><kbd>Esc</kbd><strong>시트 닫기</strong></span>
          <span class="command-key-copy">왼쪽 카드 하나를 고르면 시트에 바로 올라옵니다.</span>
        `;
        this.keyHintEl.dataset.mode = 'sheet';
      }
      this.confirmButton.disabled = true;
      this.confirmButton.innerHTML = renderFooterButtonLabel('명령 선택', 'Enter');
      this.confirmButton.title = '왼쪽 카드 하나를 고르면 시트에 올라옵니다.';
      this.cancelButton.innerHTML = renderFooterButtonLabel('시트 닫기', 'Esc');
    }
    clearTimeout(this._previewTransitionTimer);
    this.previewEl.classList.remove('preview-transition');
    void this.previewEl.offsetWidth;
    this.previewEl.classList.add('preview-transition');
    this._previewTransitionTimer = setTimeout(() => {
      this.previewEl?.classList.remove('preview-transition');
    }, 260);
  }

  _createSceneHero(sceneId, config) {
    const {
      kicker,
      title,
      summary,
      pills = [],
      asideTitle = '판단 메모',
      asideLines = [],
    } = config;
    const sceneEmblems = {
      government: '政',
      military: '戰',
      diplomacy: '盟',
      personnel: '將',
    };

    const hero = document.createElement('section');
    hero.className = `scene-hero scene-hero-${sceneId}`;
    hero.innerHTML = `
      <div class="scene-hero-main">
        <div class="scene-hero-topline">
          <div class="scene-hero-emblem">${sceneEmblems[sceneId] || '策'}</div>
          <div class="scene-hero-kicker">${kicker}</div>
        </div>
        <h3>${title}</h3>
        <p>${summary}</p>
        <div class="scene-hero-pills">
          ${pills.map((pill) => `
            <div class="scene-hero-pill">
              <span class="scene-hero-pill-label">${pill.label}</span>
              <strong class="scene-hero-pill-value">${pill.value}</strong>
            </div>
          `).join('')}
        </div>
      </div>
      <aside class="scene-hero-aside">
        <div class="scene-hero-aside-title">${asideTitle}</div>
        <ul class="scene-hero-notes">
          ${asideLines.filter(Boolean).map((line) => `<li>${line}</li>`).join('')}
        </ul>
      </aside>
    `;
    return hero;
  }

  _createSceneBoardSection({ title, kicker, badge = '운영판', variant = '', tone = 'government', cards = [] }) {
    const section = document.createElement('section');
    const sectionId = variant || createSectionKey(title);
    section.dataset.sectionId = sectionId;
    section.dataset.sectionTitle = title;
    section.dataset.sectionCount = badge;
    section.className = `command-scene-section scene-theater-section tone-${tone}${variant ? ` variant-${variant}` : ''}`;
    section.innerHTML = `
      <div class="command-scene-section-head">
        <div class="command-scene-section-kicker">${kicker}</div>
        <div class="command-scene-section-titlebar">
          <h3>${title}</h3>
          <span class="command-scene-section-badge">${badge}</span>
        </div>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = `scene-theater-grid tone-${tone}`;
    grid.innerHTML = cards.map((card) => `
      <article class="scene-theater-card tone-${card.tone || 'steady'}">
        <span class="scene-theater-label">${card.label || '판단'}</span>
        <h4>${card.title || ''}</h4>
        <ul class="scene-theater-lines">
          ${(card.lines || []).filter(Boolean).map((line) => `<li>${line}</li>`).join('')}
        </ul>
      </article>
    `).join('');
    section.appendChild(grid);
    return section;
  }

  _buildGovernmentScene(container, cityId, state) {
    const city = state.cities[cityId];
    const faction = state.getFaction(state.player.factionId);
    const tactician = state.getTactician?.(state.player.factionId);
    const currentPolicy = getCityPolicy(city);
    const noActions = state.actionsRemaining <= 0;
    const forecast = getCityForecast(cityId, state);
    const governor = city.governor;
    const cityDefense = asNumber(city.defense);
    const cityTechnology = asNumber(city.technology);
    const cityPopulation = asNumber(city.population);
    const researchStatus = getResearchStatus(state, state.player.factionId);
    const activeBuilds = Object.entries(city.buildings || {})
      .filter(([, building]) => building?.building)
      .map(([buildingId, building]) => `${BUILDINGS[buildingId]?.name || buildingId} ${building.turnsLeft}턴`);
    const governorName = city.governor ? getCharName(city.governor) : '공석';

    container.appendChild(this._createSceneHero('government', {
      kicker: '시정 장면',
      title: `${city.name} 시정 장부`,
      summary: `${governorName}가 맡은 ${city.name}의 성장 방향을 고르고, 교역과 연구, 건설로 다음 두세 턴의 흐름을 설계합니다.`,
      pills: [
        { label: '태수', value: governorName },
        { label: '시정 정책', value: currentPolicy.domestic.name },
        { label: '책사', value: tactician ? getCharName(tactician.id) : '없음' },
        { label: '공사', value: activeBuilds.length ? `${activeBuilds.length}건 진행` : '없음' },
      ],
      asideTitle: '이번 달 행정 메모',
      asideLines: [
        forecast.bonuses[0] || '건물과 기술 보너스를 함께 누적시키는 턴입니다.',
        `${currentPolicy.domestic.name}: ${currentPolicy.domestic.bonus}`,
        tactician ? `${getCharName(tactician.id)}: "${buildAdvisorOneLiner('government', cityId, state)}"` : '책사를 임명하면 장면별 조언이 더 선명해집니다.',
        forecast.risks[0] || '즉시 치명적인 위험은 없습니다.',
        activeBuilds[0] ? `진행 공사: ${activeBuilds[0]}` : `${seasonLabel(getTradeSeason(state.month))} 교역 시세도 함께 확인할 만합니다.`,
      ],
    }));

    const governmentBoard = this._createSceneBoardSection({
      title: `${city.name} 행정 운영판`,
      kicker: '행정 주도권',
      badge: '4보드',
      variant: 'government-theater',
      tone: 'government',
      cards: [
        {
          label: '도시 기조',
          title: currentPolicy.domestic.name,
          tone: 'primary',
          lines: [
            `태수 ${governorName} · 책사 ${tactician ? getCharName(tactician.id) : '공석'}`,
            forecast.recommendations[0] || '이번 턴 성장 축을 먼저 정해야 합니다.',
            currentPolicy.domestic.bonus,
          ],
        },
        {
          label: '재정·군량',
          title: `${signed(forecast.goldDelta)} 금 · ${signed(forecast.foodDelta)} 식량`,
          tone: 'economy',
          lines: [
            `세력 금 ${formatNumber(faction.gold)} · 인구 ${formatNumber(cityPopulation)}`,
            `기술 ${formatNumber(cityTechnology)} · 방어 ${formatNumber(cityDefense)}`,
            `${seasonLabel(getTradeSeason(state.month))} 교역 시세 반영`,
          ],
        },
        {
          label: '공사·연구',
          title: activeBuilds[0] || (researchStatus.researching ? researchStatus.name : '공사 대기'),
          tone: 'build',
          lines: [
            activeBuilds[0] ? `진행 공사 ${activeBuilds[0]}` : '진행 중인 공사가 없습니다.',
            researchStatus.researching ? `연구 ${researchStatus.name} 진행 중` : '연구 큐가 비어 있습니다.',
            forecast.bonuses[0] || '장기 성장 보너스는 다음 선택에 달려 있습니다.',
          ],
        },
        {
          label: '행정 리스크',
          title: forecast.risks[0] || '즉시 위기 없음',
          tone: 'risk',
          lines: [
            `치안 ${formatNumber(asNumber(city.publicOrder))} · 기술 ${formatNumber(cityTechnology)}`,
            forecast.bonuses[0] || '큰 보너스는 아직 잠재 상태입니다.',
            tactician ? `${getCharName(tactician.id)}가 장기 성장 조언을 제공합니다.` : '책사 공석이라 장면 브리프가 얕습니다.',
          ],
        },
      ],
    });

    const growthEntries = [
      { key: 'agriculture', name: '농업', desc: '식량 생산과 안정적인 병참' },
      { key: 'commerce', name: '상업', desc: '금 수입과 조공 여력' },
      { key: 'technology', name: '기술', desc: '모집·방어·연구 효율' },
      { key: 'publicOrder', name: '치안', desc: '반란 억제와 인구 성장' },
    ].map((track) => {
      const current = city[track.key] || 0;
      const preview = previewInvestment(cityId, track.key, state, governor);
      const entry = this._makeEntry({
        actionType: `invest_${track.key}`,
        params: { cityId, track: track.key, governorId: governor },
        title: `${track.name} 투자`,
        subtitle: `현재 ${current}/100 · 예상 +${preview.gain}`,
        detail: getTrackImpactLabel(track.key, forecast) || track.desc,
        cost: `금 ${INVEST_BASE_COST.toLocaleString()}`,
        effect: forecast.recommendations[0] || '다음 달 성장치에 바로 반영',
        confirmText: `결정하면 ${track.name} 투자와 함께 행동력 1이 소모됩니다.`,
        preview: {
          title: `${track.name} 투자`,
          lines: [
            `현재 수치 ${current}/100 → 예상 상승 +${preview.gain}`,
            getTrackImpactLabel(track.key, forecast) || track.desc,
            `태수 ${governor ? getCharName(governor) : '없음'} 기준 집행`,
          ],
        },
        decisionNote: forecast.recommendations[0] || `${track.name} 축을 먼저 올리면 다음 턴 선택지가 더 넓어집니다.`,
        disabled: noActions || faction.gold < INVEST_BASE_COST || current >= 100,
      });
      return entry;
    });

    const defenseEntry = this._makeEntry({
      actionType: 'invest_defense',
      params: { cityId },
      title: '성방 보강',
      subtitle: `방어 ${cityDefense}/100`,
      detail: '전선 도시일수록 당장 체감되는 안전장치입니다.',
      cost: '금 500',
      effect: `방어 +5 · 적 침공 피해 완화`,
      confirmText: '결정하면 성방 보강과 함께 행동력 1이 소모됩니다.',
      preview: {
        title: '성방 보강',
        lines: [
          `현재 방어 ${cityDefense} → ${Math.min(100, cityDefense + 5)}`,
          '공성 피해와 적 점령 확률을 낮춥니다.',
          cityDefense < 60 ? '현재 우선순위가 높은 편입니다.' : '여유가 있을 때 누적 투자하면 좋습니다.',
        ],
      },
      decisionNote: cityDefense < 60 ? '지금 당장 체감되는 생존 카드입니다.' : '전선 유지력을 천천히 끌어올리는 누적 카드입니다.',
      disabled: noActions || faction.gold < 500 || cityDefense >= 100,
    });

    const tradeBuyAmount = forecast.risks.includes('식량난') ? 4000 : city.food < 9000 ? 3000 : 2000;
    const tradeSellAmount = city.food > 18000 ? 5000 : city.food > 12000 ? 3000 : 2000;
    const buyPreview = previewFoodTrade(state, cityId, tradeBuyAmount, 'buy');
    const sellPreview = previewFoodTrade(state, cityId, tradeSellAmount, 'sell');
    const tradeEntries = [
      this._makeEntry({
        actionType: 'trade_food',
        params: { cityId, amount: tradeBuyAmount, mode: 'buy' },
        title: '군량 매입',
        subtitle: `${tradeBuyAmount.toLocaleString()} 조달 · ${seasonLabel(buyPreview.season || getTradeSeason(state.month))}`,
        detail: buyPreview.allowed
          ? `금 ${buyPreview.gold.toLocaleString()} · 식량 ${city.food.toLocaleString()} → ${buyPreview.foodAfter.toLocaleString()}`
          : tradeReasonLabel(buyPreview.reason),
        cost: buyPreview.allowed ? `금 ${buyPreview.gold.toLocaleString()}` : '집행 불가',
        effect: '도시 식량 비축 강화',
        confirmText: `${city.name} 시장에서 군량 ${tradeBuyAmount.toLocaleString()}을 매입합니다.`,
        preview: {
          title: '군량 매입',
          lines: [
            buyPreview.allowed
              ? `세력 자금 ${faction.gold.toLocaleString()} → ${buyPreview.factionGoldAfter.toLocaleString()}`
              : tradeReasonLabel(buyPreview.reason),
            buyPreview.allowed
              ? `${city.name} 식량 ${city.food.toLocaleString()} → ${buyPreview.foodAfter.toLocaleString()}`
              : '현재 시점에는 충분한 매입 조건이 아닙니다.',
            `${seasonLabel(buyPreview.season || getTradeSeason(state.month))} 기준 시세 적용`,
          ],
        },
        disabled: noActions || !buyPreview.allowed,
      }),
      this._makeEntry({
        actionType: 'trade_food',
        params: { cityId, amount: tradeSellAmount, mode: 'sell' },
        title: '군량 매각',
        subtitle: `${tradeSellAmount.toLocaleString()} 처분 · ${seasonLabel(sellPreview.season || getTradeSeason(state.month))}`,
        detail: sellPreview.allowed
          ? `금 +${sellPreview.gold.toLocaleString()} · 식량 ${city.food.toLocaleString()} → ${sellPreview.foodAfter.toLocaleString()}`
          : tradeReasonLabel(sellPreview.reason),
        cost: sellPreview.allowed ? `수익 ${sellPreview.gold.toLocaleString()}` : '집행 불가',
        effect: '자금 회수 · 후방 재정 보강',
        confirmText: `${city.name} 시장에서 군량 ${tradeSellAmount.toLocaleString()}을 매각합니다.`,
        preview: {
          title: '군량 매각',
          lines: [
            sellPreview.allowed
              ? `세력 자금 ${faction.gold.toLocaleString()} → ${sellPreview.factionGoldAfter.toLocaleString()}`
              : tradeReasonLabel(sellPreview.reason),
            sellPreview.allowed
              ? `${city.name} 식량 ${city.food.toLocaleString()} → ${sellPreview.foodAfter.toLocaleString()}`
              : '최소 비축량을 남기지 못해 매각할 수 없습니다.',
            `${seasonLabel(sellPreview.season || getTradeSeason(state.month))}는 매각 타이밍에 영향을 줍니다.`,
          ],
        },
        disabled: noActions || !sellPreview.allowed,
      }),
    ];

    const policyEntries = Object.values(CITY_DOMESTIC_POLICIES).map((policy) => this._makeEntry({
      actionType: 'set_city_policy',
      params: { cityId, policyType: 'domesticFocus', value: policy.key },
      title: policy.name,
      subtitle: policy.track ? `${trackName(policy.track)} 장기 누적` : '균형 성장',
      detail: policy.key === 'balanced'
        ? '특정 축에 치우치지 않고 도시 전체를 무난하게 운용합니다.'
        : `${policy.bonus} · 매월 ${trackName(policy.track)} +1`,
      cost: currentPolicy.domesticFocus === policy.key ? '현재 적용 중' : '행동력 1',
      effect: policy.key === 'balanced'
        ? '추가 왜곡 없는 표준 운용'
        : `${policy.name} 정책으로 월간 예측과 장기 누적이 바뀜`,
      confirmText: `${city.name}의 시정 정책을 ${policy.name}로 전환합니다.`,
      preview: {
        title: `${policy.name} 정책`,
        lines: [
          policy.key === 'balanced' ? '도시 운영을 균형형으로 되돌립니다.' : `매월 ${trackName(policy.track)} 수치가 1씩 누적됩니다.`,
          `금 수입 ×${(policy.goldMult || 1).toFixed(2)} · 식량 생산 ×${(policy.foodMult || 1).toFixed(2)}`,
          policy.orderDelta ? `치안 변동 ${signed(policy.orderDelta)}` : '추가 치안 변동 없음',
        ],
      },
      disabled: noActions || currentPolicy.domesticFocus === policy.key,
    }));

    const buildingEntries = getAvailableBuildings(state, cityId).map((building) => {
      const existing = city.buildings?.[building.id];
      const levelText = existing ? `Lv.${existing.level}→${existing.level + 1}` : 'Lv.1';
      return this._makeEntry({
        actionType: 'build',
        params: { cityId, buildingId: building.id },
        title: `${building.name} ${levelText}`,
        subtitle: BUILDINGS[building.id]?.desc || '도시 특화 건설',
        detail: `${formatBuildingEffects(building.id)} · ${BUILDINGS[building.id]?.buildTime || 0}턴`,
        cost: `금 ${building.cost.toLocaleString()}`,
        effect: `${city.name}의 장기 효율을 누적 강화`,
        confirmText: `결정하면 ${building.name} 건설을 시작합니다.`,
        preview: {
          title: `${building.name} ${levelText}`,
          lines: [
            BUILDINGS[building.id]?.desc || '도시 운영 보너스를 제공합니다.',
            formatBuildingEffects(building.id),
            `${BUILDINGS[building.id]?.buildTime || 0}턴 뒤 효과 발동`,
          ],
        },
        disabled: noActions || !building.canBuild,
      });
    });

    const researchEntries = getAvailableTechs(state, state.player.factionId).map((tech) => this._makeEntry({
      actionType: 'start_research',
      params: { techId: tech.id },
      title: tech.name,
      subtitle: `${tech.turns}턴 연구 · ${formatTechEffects(tech.id)}`,
      detail: TECHS[tech.id]?.desc || '세력 단위 장기 보너스',
      cost: `금 ${tech.cost.toLocaleString()}`,
      effect: researchStatus.researching ? `${researchStatus.name} 진행 중` : '이번 달부터 연구 큐에 진입',
      confirmText: `결정하면 ${tech.name} 연구를 시작합니다.`,
      preview: {
        title: `${tech.name} 연구`,
        lines: [
          TECHS[tech.id]?.desc || '세력 단위 보너스를 제공합니다.',
          formatTechEffects(tech.id),
          !tech.available ? `잠금 조건: ${tech.reason}` : `${tech.turns}턴 뒤 완료 예정`,
        ],
      },
      disabled: noActions || !tech.available,
    }));

    const board = document.createElement('div');
    board.className = 'command-scene-grid government-grid';
    board.appendChild(governmentBoard);
    board.appendChild(this._createSceneSection('도시 정책', '시정 노선', policyEntries, 'compact', 'government-policy'));
    board.appendChild(this._createSceneSection('시정 장부', '도시 성장·교역', [ ...growthEntries, defenseEntry, ...tradeEntries ], '', 'government-ledger', true));
    board.appendChild(this._createSceneSection('건설 공방', '도시 특화', buildingEntries, 'compact', 'government-build'));
    board.appendChild(this._createSceneSection('연구 서고', researchStatus.researching ? `진행 중: ${researchStatus.name}` : '세력 단위 보너스', researchEntries, 'compact', 'government-research'));
    container.appendChild(board);
  }

  _buildMilitaryScene(container, cityId, state) {
    const city = state.cities[cityId];
    const faction = state.getFaction(state.player.factionId);
    const tactician = state.getTactician?.(state.player.factionId);
    const currentPolicy = getCityPolicy(city);
    const noActions = state.actionsRemaining <= 0;
    const isOwned = city.owner === state.player.factionId;
    const enemyNeighbors = this._getEnemyNeighbors(cityId, state);
    const friendlyNeighbors = this._getFriendlyNeighbors(cityId, state);
    const neutralFronts = this._getNonHostileNeighborFactions(cityId, state);

    const attackEntries = [];
    const movementEntries = [];
    const supplyEntries = [];
    const warEntries = [];
    const conscriptPreview = isOwned ? previewConscript(cityId, state, city.governor || faction?.leader) : null;

    if (isOwned) {
      for (const targetId of this._getEnemyNeighbors(cityId, state)) {
        const target = state.cities[targetId];
        const terrain = state.getConnectionTerrain(cityId, targetId);
        attackEntries.push(this._makeEntry({
          actionType: 'attack',
          params: { fromCity: cityId, toCity: targetId, terrain },
          title: `${city.name} → ${target.name} 출진`,
          subtitle: `적 병력 ${target.army.toLocaleString()} · ${terrainLabel(terrain)}`,
          detail: buildBattleTeaser(state, cityId, targetId),
          cost: '행동력 1',
          effect: `${city.name} 병력의 60%로 침공`,
          confirmText: `${target.name} 침공을 명령합니다.`,
          preview: {
            title: `${target.name} 침공`,
            lines: buildBattleLines(state, cityId, targetId),
          },
          decisionNote: `${target.name} 전선을 흔드는 직접 카드입니다. 첫 3턴에 가장 드라마가 큰 선택지입니다.`,
          disabled: noActions || city.army < 3000,
        }));
      }

      for (const neighborId of this._getFriendlyNeighbors(cityId, state)) {
        const neighbor = state.cities[neighborId];
        const amount = Math.floor(city.army * 0.5);
        movementEntries.push(this._makeEntry({
          actionType: 'move_troops',
          params: { fromCity: cityId, toCity: neighborId, amount, generals: [] },
          title: `${neighbor.name}로 병력 이동`,
          subtitle: `절반 이동 · ${amount.toLocaleString()}명`,
          detail: `${city.name}와 ${neighbor.name} 사이의 전선 재배치`,
          cost: '행동력 1',
          effect: `${city.name} 병력 재분산`,
          confirmText: `${neighbor.name}로 병력을 이동합니다.`,
          preview: {
            title: `${neighbor.name} 병력 이동`,
            lines: [
              `${city.name}에서 ${amount.toLocaleString()}명을 이동`,
              `이동 후 ${city.name} 잔류 ${Math.max(0, city.army - amount).toLocaleString()}명`,
              `${neighbor.name} 전선 방어·집결용 재배치`,
            ],
          },
          disabled: noActions || amount < 1000,
        }));

        const supplyPlan = getSuggestedFoodTransport(city, neighbor, enemyNeighbors.length > 0);
        const preview = previewFoodTransport(state, cityId, neighborId, supplyPlan.amount, this._connections);
        if (supplyPlan.amount > 0 && preview.reason === 'ok') {
          supplyEntries.push(this._makeEntry({
            actionType: 'transport_food',
            params: { fromCity: cityId, toCity: neighborId, amount: supplyPlan.amount },
            title: `${neighbor.name}로 군량 수송`,
            subtitle: `식량 ${supplyPlan.amount.toLocaleString()} · ${supplyPlan.reason}`,
            detail: `${city.name} 잔여 ${preview.sourceAfter.toLocaleString()} · ${neighbor.name} 도착 ${preview.targetAfter.toLocaleString()}`,
            cost: '행동력 1',
            effect: `${neighbor.name} 병참 안정 · 장기전 대비`,
            confirmText: `${neighbor.name}로 군량 ${supplyPlan.amount.toLocaleString()}을 수송합니다.`,
            preview: {
              title: `${neighbor.name} 군량 수송`,
              lines: [
                `${city.name} 식량 ${city.food.toLocaleString()} → ${preview.sourceAfter.toLocaleString()}`,
                `${neighbor.name} 식량 ${neighbor.food.toLocaleString()} → ${preview.targetAfter.toLocaleString()}`,
                preview.leavesBuffer ? '출발 도시에 최소 비축량이 남습니다.' : '출발 도시 비축이 빠듯해집니다.',
              ],
            },
            disabled: noActions,
          }));
        }
      }

      if (conscriptPreview) {
        supplyEntries.unshift(this._makeEntry({
          actionType: 'conscript',
          params: { cityId, governorId: city.governor || faction?.leader || null },
          title: '징병 실시',
          subtitle: conscriptPreview.allowed
            ? `예상 ${conscriptPreview.recruits.toLocaleString()}명 · 치안 -${conscriptPreview.orderLoss}`
            : conscriptReasonLabel(conscriptPreview.reason),
          detail: conscriptPreview.allowed
            ? `금 ${conscriptPreview.goldCost.toLocaleString()} · 군량 ${conscriptPreview.foodCost.toLocaleString()} · 인구 -${conscriptPreview.populationLoss.toLocaleString()}`
            : '치안, 인구, 자금, 군량 조건을 먼저 갖춰야 합니다.',
          cost: conscriptPreview.allowed ? `금 ${conscriptPreview.goldCost.toLocaleString()}` : '집행 불가',
          effect: conscriptPreview.allowed
            ? `병력 ${city.army.toLocaleString()} → ${(city.army + conscriptPreview.recruits).toLocaleString()}`
            : '도시 조건 정비 후 재검토',
          confirmText: `${city.name}에서 징병을 실시합니다.`,
          preview: {
            title: '징병 실시',
            lines: [
              conscriptPreview.allowed
                ? `병력 ${city.army.toLocaleString()} → ${(city.army + conscriptPreview.recruits).toLocaleString()}`
                : conscriptReasonLabel(conscriptPreview.reason),
              conscriptPreview.allowed
                ? `치안 ${asNumber(city.publicOrder)} → ${conscriptPreview.publicOrderAfter} · 인구 ${formatNumber(city.population)} → ${formatNumber(conscriptPreview.populationAfter)}`
                : '치안 20+, 충분한 인구와 군량이 필요합니다.',
              conscriptPreview.allowed
                ? `군량 ${city.food.toLocaleString()} → ${formatNumber(conscriptPreview.foodAfter)}`
                : '조건을 갖추면 전선 보강에 즉시 쓰이는 병력을 얻습니다.',
            ],
          },
          decisionNote: enemyNeighbors.length > 0 ? '접경 도시라면 가장 즉각적으로 체감되는 전력 보강입니다.' : '다음 턴 군사 명령의 폭을 미리 넓히는 준비 행동입니다.',
          disabled: noActions || !conscriptPreview.allowed,
        }));
      }

      for (const factionId of this._getNonHostileNeighborFactions(cityId, state)) {
        const targetFaction = state.factions[factionId];
        warEntries.push(this._makeEntry({
          actionType: 'declare_war',
          params: { targetFaction: factionId },
          title: `${targetFaction.name}에 선전포고`,
          subtitle: state.hasTruce(state.player.factionId, factionId) ? '휴전 파기' : '전쟁 개시',
          detail: '평판과 외교 지형에 즉시 영향을 줍니다.',
          cost: '행동력 1',
          effect: '접경 도시가 즉시 침공 가능 상태로 전환',
          confirmText: `${targetFaction.name}와의 전쟁을 개시합니다.`,
          preview: {
            title: `${targetFaction.name} 선전포고`,
            lines: [
              `현재 총병력 ${state.getTotalArmy(state.player.factionId).toLocaleString()} vs ${state.getTotalArmy(factionId).toLocaleString()}`,
              state.hasTruce(state.player.factionId, factionId) ? '휴전 파기로 평판 손실이 커집니다.' : '접경 도시에 바로 압박을 넣을 수 있습니다.',
              '결정 후 곧바로 외교 상태가 전쟁으로 전환됩니다.',
            ],
          },
          disabled: noActions,
        }));
      }
    } else if (city.owner) {
      const approaches = this._getFriendlyNeighborApproaches(cityId, state);
      for (const fromCityId of approaches) {
        const fromCity = state.cities[fromCityId];
        const terrain = state.getConnectionTerrain(fromCityId, cityId);
        if (state.isAtWar(state.player.factionId, city.owner)) {
          attackEntries.push(this._makeEntry({
            actionType: 'attack',
            params: { fromCity: fromCityId, toCity: cityId, terrain },
            title: `${fromCity.name} → ${city.name} 침공`,
            subtitle: `아군 ${fromCity.army.toLocaleString()} · 적 ${city.army.toLocaleString()}`,
            detail: buildBattleTeaser(state, fromCityId, cityId),
            cost: '행동력 1',
            effect: `${fromCity.name} 전선 돌파 시도`,
            confirmText: `${city.name} 공격을 명령합니다.`,
          preview: {
            title: `${city.name} 공격`,
            lines: buildBattleLines(state, fromCityId, cityId),
          },
          decisionNote: `지금 전선을 실제로 움직이는 직접 행동입니다. ${city.name}의 병력과 지형을 먼저 읽으십시오.`,
          disabled: noActions || fromCity.army < 3000,
        }));
        }
      }

      if (!state.isAtWar(state.player.factionId, city.owner)) {
        warEntries.push(this._makeEntry({
          actionType: 'declare_war',
          params: { targetFaction: city.owner },
          title: `${state.factions[city.owner].name}에 선전포고`,
          subtitle: `${city.name} 전선 개방`,
          detail: '이 도시를 중심으로 전면전을 시작합니다.',
          cost: '행동력 1',
          effect: '선택 도시를 즉시 전선 도시로 전환',
          confirmText: `${state.factions[city.owner].name}와 전쟁을 시작합니다.`,
          preview: {
            title: `${state.factions[city.owner].name} 개전`,
            lines: [
              `${city.name} 접경선이 즉시 활성화됩니다.`,
              `총병력 ${state.getTotalArmy(state.player.factionId).toLocaleString()} vs ${state.getTotalArmy(city.owner).toLocaleString()}`,
              '개전 직후 병력 집결과 방어 균형이 중요합니다.',
            ],
          },
          disabled: noActions,
        }));
      }
    }

    container.appendChild(this._createSceneHero('military', {
      kicker: '군령 장면',
      title: isOwned ? `${city.name} 전선 작전판` : `${city.name} 공세 결정판`,
      summary: isOwned
        ? `${city.name}의 병력과 접경선을 바탕으로 침공, 집결, 개전 순서를 결정합니다.`
        : `${city.name}을(를) 중심으로 전쟁을 열지, 우회할지, 외교로 풀지 판단하는 장면입니다.`,
      pills: [
        { label: '병력', value: formatNumber(city.army) },
        { label: '방어', value: formatNumber(asNumber(city.defense)) },
        { label: '군령 정책', value: currentPolicy.military.name },
        { label: '동원', value: conscriptPreview?.allowed ? `${conscriptPreview.recruits.toLocaleString()}명` : '대기' },
      ],
      asideTitle: '전황 메모',
      asideLines: [
        attackEntries[0]?.preview?.lines?.[0] || '즉시 침공 가능한 적 도시는 아직 없습니다.',
        `${currentPolicy.military.name}: ${currentPolicy.military.bonus}`,
        tactician ? `${getCharName(tactician.id)}: "${buildAdvisorOneLiner('military', cityId, state)}"` : attackEntries[0]?.preview?.lines?.[1] || '책사를 임명하면 전황 메모가 강화됩니다.',
        attackEntries[0]?.preview?.lines?.[1] || `${terrainLabel(city.terrain?.type || city.terrain)} 거점. 지형을 활용한 수비가 중요합니다.`,
        conscriptPreview?.allowed ? `징병 시 치안 -${conscriptPreview.orderLoss}, 인구 -${formatNumber(conscriptPreview.populationLoss)}` : (neutralFronts.length > 0 ? `개전 후보 세력 ${neutralFronts.length}곳` : '현재 접경 전쟁에 병력을 집중할 수 있습니다.'),
      ],
    }));

    const militaryBoard = this._createSceneBoardSection({
      title: `${city.name} 전황 지휘판`,
      kicker: '전선 주도권',
      badge: '4보드',
      variant: 'military-theater',
      tone: 'military',
      cards: [
        {
          label: '전선 압력',
          title: enemyNeighbors.length ? `적 ${enemyNeighbors.length}면 압박` : '직접 적 없음',
          tone: 'primary',
          lines: [
            `${friendlyNeighbors.length}개 아군 연결 · ${neutralFronts.length}개 비적대 접경`,
            `${terrainLabel(city.terrain?.type || city.terrain)} · 방어 ${formatNumber(asNumber(city.defense))}`,
            currentPolicy.military.bonus,
          ],
        },
        {
          label: '주 공격선',
          title: attackEntries[0]?.title || warEntries[0]?.title || '직접 공세 대기',
          tone: 'offense',
          lines: [
            attackEntries[0]?.subtitle || warEntries[0]?.subtitle || '지금 당장 누를 공격 카드는 비어 있습니다.',
            attackEntries[0]?.detail || warEntries[0]?.detail || '군령 정책과 접경선 정비가 먼저 필요합니다.',
            attackEntries[0]?.decisionNote || `병력 ${formatNumber(city.army)} · 사기 ${formatNumber(asNumber(city.morale))}`,
          ],
        },
        {
          label: '동원·병참',
          title: conscriptPreview?.allowed ? `징병 ${formatNumber(conscriptPreview.recruits)}명` : supplyEntries[0]?.title || '병참 대기',
          tone: 'logistics',
          lines: [
            conscriptPreview?.allowed
              ? `치안 -${conscriptPreview.orderLoss} · 군량 ${formatNumber(conscriptPreview.foodCost)} 소모`
              : conscriptReasonLabel(conscriptPreview?.reason) || '즉시 징병 조건이 아직 부족합니다.',
            supplyEntries[0]?.title || '수송·보급 카드를 더 준비해야 합니다.',
            supplyEntries[0]?.detail || '지금 턴 병참 창은 상대적으로 얕습니다.',
          ],
        },
        {
          label: '전쟁 상태',
          title: `${(faction.enemies || []).length}곳 전쟁 · ${(faction.allies || []).length}곳 동맹`,
          tone: 'risk',
          lines: [
            warEntries[0]?.title || '추가 개전 카드는 아직 비어 있습니다.',
            tactician ? `${getCharName(tactician.id)}가 군령 판단을 보정합니다.` : '책사 공석이라 전황 조언 깊이가 얕습니다.',
            city.army < 3000 ? '병력 3,000 미만이면 직접 침공이 막힙니다.' : '직접 침공 조건은 충족합니다.',
          ],
        },
      ],
    });

    const postureEntries = Object.values(CITY_MILITARY_POLICIES).map((policy) => this._makeEntry({
      actionType: 'set_city_policy',
      params: { cityId, policyType: 'militaryPosture', value: policy.key },
      title: policy.name,
      subtitle: policy.key === 'mobilize'
        ? `징병 효율 +${Math.round((policy.recruitEfficiency || 0) * 100)}%`
        : policy.key === 'fortify'
          ? `매월 방어 ${signed(policy.defenseDelta)}`
          : policy.key === 'aggressive'
            ? `매월 사기 ${signed(policy.moraleDelta)}`
            : '균형 전선',
      detail: policy.key === 'balanced'
        ? '병력, 수비, 동원을 특정 방향으로 몰지 않습니다.'
        : `${policy.bonus} · 전황 메모와 월간 패시브가 달라집니다.`,
      cost: currentPolicy.militaryPosture === policy.key ? '현재 적용 중' : '행동력 1',
      effect: `군령 정책을 ${policy.name}로 전환`,
      confirmText: `${city.name}의 군령 정책을 ${policy.name}로 바꿉니다.`,
      preview: {
        title: `${policy.name} 군령`,
        lines: [
          policy.defenseDelta ? `매월 방어 ${signed(policy.defenseDelta)}` : '추가 방어 패시브 없음',
          policy.moraleDelta ? `매월 사기 ${signed(policy.moraleDelta)}` : '추가 사기 패시브 없음',
          policy.recruitEfficiency ? `징병 효율 +${Math.round(policy.recruitEfficiency * 100)}%` : '징병 효율 보정 없음',
        ],
      },
      disabled: noActions || currentPolicy.militaryPosture === policy.key,
    }));

    const board = document.createElement('div');
    board.className = 'command-scene-grid military-grid';
    board.appendChild(militaryBoard);
    board.appendChild(this._createSceneSection('전선 방침', '군령 정책', postureEntries, 'compact', 'military-posture'));
    board.appendChild(this._createSceneSection('전선 작전', '침공·요충지 판단', attackEntries, '', 'military-offense', true));
    board.appendChild(this._createSceneSection('병력 재배치', '집결·보강', movementEntries, 'compact', 'military-movement'));
    board.appendChild(this._createSceneSection('징병과 병참', '동원·식량·보급선', supplyEntries, 'compact', 'military-logistics'));
    board.appendChild(this._createSceneSection('전쟁 상태', '개전·압박', warEntries, 'compact', 'military-war'));
    container.appendChild(board);
  }

  _buildDiplomacyScene(container, cityId, state) {
    const city = state.cities[cityId];
    const faction = state.getFaction(state.player.factionId);
    const tactician = state.getTactician?.(state.player.factionId);
    const noActions = state.actionsRemaining <= 0;
    const isOwned = city.owner === state.player.factionId;
    const targetFactionIds = !city.owner || isOwned
      ? Object.keys(state.factions).filter((fId) => fId !== state.player.factionId && state.factions[fId].active)
      : [city.owner];

    const diplomacyEntries = [];
    for (const targetFactionId of targetFactionIds) {
      const target = state.factions[targetFactionId];
      const isAtWar = state.isAtWar(state.player.factionId, targetFactionId);
      const isAllied = state.isAllied(state.player.factionId, targetFactionId);
      const relationPrefix = `${target.name} · ${isAtWar ? '전쟁 중' : isAllied ? '동맹' : '긴장'}`;

      if (isAtWar) {
        const peaceChance = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'peace', state).chance;
        diplomacyEntries.push(this._makeEntry({
          actionType: 'propose_peace',
          params: { targetFaction: targetFactionId },
          title: `${target.name}에 강화 제안`,
          subtitle: `${relationPrefix} · 성공률 ${Math.round(peaceChance * 100)}%`,
          detail: '전쟁 피로도를 끊고 내정으로 숨을 돌리는 선택지입니다.',
          cost: '행동력 1',
          effect: '성공 시 휴전·평판 안정',
          confirmText: `${target.name}에 강화를 제안합니다.`,
          preview: {
            title: `${target.name} 강화`,
            lines: [
              `성공률 ${Math.round(peaceChance * 100)}%`,
              `총병력 ${state.getTotalArmy(state.player.factionId).toLocaleString()} vs ${state.getTotalArmy(targetFactionId).toLocaleString()}`,
              '성공 시 접경 압박이 즉시 줄어듭니다.',
            ],
          },
          decisionNote: '전쟁이 길어질수록 첫 플레이 감각이 둔해집니다. 강화는 템포를 다시 잡는 선택입니다.',
          disabled: noActions,
        }));
      }

      if (!isAtWar && !isAllied) {
        const allianceChance = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'alliance', state).chance;
        const marriageChance = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'marriage', state).chance;
        diplomacyEntries.push(this._makeEntry({
          actionType: 'propose_alliance',
          params: { targetFaction: targetFactionId },
          title: `${target.name}에 동맹 제안`,
          subtitle: `${relationPrefix} · 성공률 ${Math.round(allianceChance * 100)}%`,
          detail: '초반 전선 수를 줄이는 가장 직접적인 외교 카드입니다.',
          cost: '행동력 1',
          effect: '성공 시 상호 불가침과 우호 상승',
          confirmText: `${target.name}에 동맹을 제안합니다.`,
          preview: {
            title: `${target.name} 동맹 제안`,
            lines: [
              `성공률 ${Math.round(allianceChance * 100)}%`,
              `평판 ${faction.reputation || 100} 기준 외교 판정`,
              '전선을 줄이는 대신 성장 속도를 확보합니다.',
            ],
          },
          decisionNote: '초반 전선을 하나라도 줄이면 시정과 병참 선택이 훨씬 선명해집니다.',
          disabled: noActions,
        }));
        diplomacyEntries.push(this._makeEntry({
          actionType: 'propose_marriage',
          params: { targetFaction: targetFactionId },
          title: `${target.name}에 혼인동맹`,
          subtitle: `${relationPrefix} · 성공률 ${Math.round(marriageChance * 100)}%`,
          detail: '평판과 관계를 더 크게 움직이지만 조건이 까다롭습니다.',
          cost: '행동력 1',
          effect: '성공 시 장기 우호 관계 구축',
          confirmText: `${target.name}에 혼인동맹을 제안합니다.`,
          preview: {
            title: `${target.name} 혼인동맹`,
            lines: [
              `성공률 ${Math.round(marriageChance * 100)}%`,
              '동맹보다 강한 정치적 결속을 노립니다.',
              '거절 시 턴 낭비가 될 수 있어 타이밍이 중요합니다.',
            ],
          },
          disabled: noActions,
        }));
      }

      if (!isAtWar && faction.gold >= 2000) {
        diplomacyEntries.push(this._makeEntry({
          actionType: 'send_tribute',
          params: { targetFaction: targetFactionId, amount: 2000 },
          title: `${target.name}에 조공`,
          subtitle: `${relationPrefix} · 금 2,000`,
          detail: '호감과 평판을 동시에 올리는 비용형 선택지입니다.',
          cost: '금 2,000',
          effect: '우호 상승 · 평판 회복',
          confirmText: `${target.name}에 금 2,000을 조공합니다.`,
          preview: {
            title: `${target.name} 조공`,
            lines: [
              '지금 전쟁을 피하고 싶은 세력에게 유효합니다.',
              '평판 회복과 외교 확률 상승에 도움이 됩니다.',
              `현재 금 ${faction.gold.toLocaleString()} 보유`,
            ],
          },
          disabled: noActions,
        }));
      }

      if (!isAtWar && !isAllied && state.getTotalArmy(state.player.factionId) > state.getTotalArmy(targetFactionId) * 2) {
        const threatChance = calculateDiplomacyChance(state.player.factionId, targetFactionId, 'threaten', state).chance;
        diplomacyEntries.push(this._makeEntry({
          actionType: 'threaten',
          params: { targetFaction: targetFactionId },
          title: `${target.name} 위협`,
          subtitle: `${relationPrefix} · 성공률 ${Math.round(threatChance * 100)}%`,
          detail: '병력 우세를 바탕으로 자원을 뜯어내는 강압 수단입니다.',
          cost: '행동력 1',
          effect: '성공 시 조공 획득 · 평판 하락',
          confirmText: `${target.name}을(를) 위협합니다.`,
          preview: {
            title: `${target.name} 위협`,
            lines: [
              `성공률 ${Math.round(threatChance * 100)}%`,
              '실패하면 외교 관계만 악화될 수 있습니다.',
              '병력 우세가 클수록 위협 카드가 강해집니다.',
            ],
          },
          disabled: noActions,
        }));
      }
    }

    const espionageEntries = [];
    if (!isOwned && city.owner) {
      const myChars = state.getCharactersOfFaction(state.player.factionId);
      const spies = myChars.filter((char) => char.stats.intellect >= 60).sort((a, b) => b.stats.intellect - a.stats.intellect);
      const bestSpy = spies[0];

      if (bestSpy) {
        for (const [actionId, action] of Object.entries(ESPIONAGE_ACTIONS)) {
          const chance = calculateEspionageChance(state, bestSpy.id, cityId, actionId).chance;
          espionageEntries.push(this._makeEntry({
            actionType: 'espionage',
            params: { spyId: bestSpy.id, targetCityId: cityId, actionType: actionId },
            title: `${action.name}`,
            subtitle: `${city.name} · 성공률 ${Math.round(chance * 100)}%`,
            detail: `${action.desc} · 담당 ${getCharName(bestSpy.id)}`,
            cost: `금 ${action.cost.toLocaleString()}`,
            effect: chance >= 0.6 ? '고확률 작전' : '위험 부담이 있는 작전',
            confirmText: `${getCharName(bestSpy.id)}에게 ${action.name}을(를) 명령합니다.`,
            preview: {
              title: `${city.name} 첩보 — ${action.name}`,
              lines: [
                `${action.desc}`,
                `담당 ${getCharName(bestSpy.id)} · 지력 ${bestSpy.stats.intellect}`,
                `성공률 ${Math.round(chance * 100)}%`,
              ],
            },
            disabled: noActions || faction.gold < action.cost,
          }));
        }
      }
    }

    const focusedFactionId = !isOwned && city.owner ? city.owner : targetFactionIds[0];
    const focusedFaction = focusedFactionId ? state.factions[focusedFactionId] : null;
    const focusedRelation = focusedFactionId
      ? state.isAtWar(state.player.factionId, focusedFactionId)
        ? '전쟁'
        : state.isAllied(state.player.factionId, focusedFactionId)
          ? '동맹'
          : '긴장'
      : '대기';
    container.appendChild(this._createSceneHero('diplomacy', {
      kicker: '외교 장면',
      title: focusedFaction ? `${focusedFaction.name} 관계 보드` : '천하 외교 장부',
      summary: focusedFaction
        ? `${focusedFaction.name}과의 관계, 평판, 전쟁 여부를 보며 강화와 동맹, 위협, 첩보를 조합합니다.`
        : '현재 살아 있는 세력을 상대로 관계를 조정하고 전선을 줄일 타이밍을 계산합니다.',
      pills: [
        { label: '평판', value: formatNumber(faction.reputation || 100) },
        { label: '전쟁', value: `${(faction.enemies || []).length}곳` },
        { label: '동맹', value: `${(faction.allies || []).length}곳` },
        { label: '책사', value: tactician ? getCharName(tactician.id) : `${targetFactionIds.length}세력` },
      ],
      asideTitle: '교섭 메모',
      asideLines: [
        diplomacyEntries[0]?.preview?.lines?.[0] || '현재 즉시 제안할 외교 카드는 많지 않습니다.',
        tactician ? `${getCharName(tactician.id)}: "${buildAdvisorOneLiner('diplomacy', cityId, state)}"` : '책사를 임명하면 외교 브리핑이 더 구체적으로 열립니다.',
        diplomacyEntries[0]?.preview?.lines?.[1] || '외교는 병력 차와 평판의 영향을 크게 받습니다.',
        espionageEntries[0]?.preview?.lines?.[2] || '첩보는 외교와 같은 턴에 다음 전선을 준비하는 카드입니다.',
      ],
    }));

    const diplomacyBoard = this._createSceneBoardSection({
      title: focusedFaction ? `${focusedFaction.name} 외교 전개판` : '천하 외교 전개판',
      kicker: '관계 주도권',
      badge: '4보드',
      variant: 'diplomacy-theater',
      tone: 'diplomacy',
      cards: [
        {
          label: '외교 지형',
          title: `평판 ${formatNumber(faction.reputation || 100)}`,
          tone: 'primary',
          lines: [
            `전쟁 ${(faction.enemies || []).length}곳 · 동맹 ${(faction.allies || []).length}곳`,
            `${targetFactionIds.length}개 세력과 교섭 가능`,
            tactician ? `${getCharName(tactician.id)}가 외교 조언을 제공합니다.` : '책사 공석이라 외교 브리프가 얕습니다.',
          ],
        },
        {
          label: '집중 대상',
          title: focusedFaction ? `${focusedFaction.name} · ${focusedRelation}` : '집중 대상 없음',
          tone: 'relation',
          lines: [
            diplomacyEntries[0]?.title || '즉시 제안할 카드가 없습니다.',
            diplomacyEntries[0]?.subtitle || '병력 차나 관계를 더 벌려야 창이 열립니다.',
            diplomacyEntries[0]?.detail || '지금은 군사 장면과 번갈아 템포를 잡는 편이 낫습니다.',
          ],
        },
        {
          label: '교섭 창',
          title: diplomacyEntries[0]?.title || '교섭 대기',
          tone: 'window',
          lines: [
            diplomacyEntries[0]?.preview?.lines?.[0] || '성공률 계산 대기',
            diplomacyEntries[1]?.title || '대안 교섭 카드 없음',
            diplomacyEntries[1]?.preview?.lines?.[0] || '한 장면에서 강한 카드가 아직 적습니다.',
          ],
        },
        {
          label: '첩보 창',
          title: espionageEntries[0]?.title || '첩보 대기',
          tone: 'risk',
          lines: [
            espionageEntries[0]?.subtitle || (!isOwned && city.owner ? '지력 60 이상 장수가 있어야 열립니다.' : '적 도시를 고르면 열립니다.'),
            espionageEntries[0]?.detail || '은밀 작전 카드는 아직 비어 있습니다.',
            espionageEntries[0]?.preview?.lines?.[2] || '첩보는 다음 턴 군사 장면과 연결됩니다.',
          ],
        },
      ],
    });

    const board = document.createElement('div');
    board.className = 'command-scene-grid diplomacy-grid';
    board.appendChild(diplomacyBoard);
    board.appendChild(this._createSceneSection('외교 교섭', '관계·강화·동맹', diplomacyEntries, '', 'diplomacy-negotiation', true));
    board.appendChild(this._createSceneSection('첩보 작전', espionageEntries.length ? '적 도시 대상 은밀 작전' : '적 도시 선택 시 활성화', espionageEntries, 'compact', 'diplomacy-espionage'));
    container.appendChild(board);
  }

  _buildPersonnelScene(container, cityId, state) {
    const city = state.cities[cityId];
    const noActions = state.actionsRemaining <= 0;

    if (city.owner !== state.player.factionId) {
      container.appendChild(this._createSceneSection('인사 장면', '자국 도시에서만 사용 가능', []));
      return;
    }

    const faction = state.getFaction(state.player.factionId);
    const currentTactician = state.getTactician?.(state.player.factionId);
    const searchEntries = [];
    const captivesEntries = [];
    const rewardEntries = [];
    const assignmentEntries = [];

    const wanderers = state.getWanderingInCity(cityId);
    const topSearcher = [...state.getCharactersInCity(cityId)]
      .filter((char) => char.faction === state.player.factionId)
      .sort((a, b) => b.stats.charisma - a.stats.charisma || b.stats.intellect - a.stats.intellect)[0];
    const searchPreviewMeta = topSearcher
      ? charMgr.calculateSearchChance(cityId, topSearcher.id, state)
      : { chance: 0, factors: {} };
    const searchChance = Math.round((searchPreviewMeta.chance || 0) * 100);
    searchEntries.push(this._makeEntry({
      actionType: 'search_talent',
      params: { cityId },
      title: '인재 탐색',
      subtitle: wanderers.length > 0 ? `${wanderers.length}명 감지` : '미발견 상태',
      detail: '매력 높은 장수가 도시 주변의 인재를 찾습니다.',
      cost: '행동력 1',
      effect: '발견 시 즉시 자동 등용 시도',
      confirmText: `${city.name}에서 인재를 탐색합니다.`,
      preview: {
        title: '인재 탐색',
        lines: [
          wanderers.length > 0 ? `${wanderers.length}명의 방랑 인재가 감지됩니다.` : '현재 감지된 인재는 없습니다.',
          topSearcher ? `${getCharName(topSearcher.id)} 기준 발견 확률 ${searchChance}%` : '탐색 담당 장수가 아직 없습니다.',
          currentTactician ? `${getCharName(currentTactician.id)}의 책사 보정이 탐색 판단에 반영됩니다.` : '책사를 임명하면 탐색과 등용 판단이 더 안정됩니다.',
          '발견 즉시 자동 등용 시도가 이어집니다.',
        ],
      },
      disabled: noActions,
    }));

    const captives = state.getCaptivesOfFaction(state.player.factionId).filter((char) => char.city === cityId);
    for (const captive of captives) {
      captivesEntries.push(this._makeEntry({
        actionType: 'persuade_captive',
        params: { captiveId: captive.id, cityId },
        title: `${getCharName(captive.id)} 설득`,
        subtitle: `포로 · 감금 ${captive.turnsInCaptivity || 0}턴`,
        detail: `총합 ${totalStats(captive.stats)} · 매력 장수가 설득`,
        cost: '행동력 1',
        effect: '성공 시 즉시 우리 장수로 편입',
        confirmText: `${getCharName(captive.id)} 설득을 시도합니다.`,
        preview: {
          title: `${getCharName(captive.id)} 설득`,
          lines: [
            `감금 ${captive.turnsInCaptivity || 0}턴`,
            `능력 총합 ${totalStats(captive.stats)}`,
            '설득 실패 시 포로 상태가 유지됩니다.',
          ],
        },
        disabled: noActions,
      }));
      captivesEntries.push(this._makeEntry({
        actionType: 'release_captive',
        params: { captiveId: captive.id },
        title: `${getCharName(captive.id)} 석방`,
        subtitle: '포로 처리',
        detail: '직접 전력은 잃지만 평판과 관계에 영향을 줄 수 있습니다.',
        cost: '행동력 1',
        effect: '즉시 석방',
        confirmText: `${getCharName(captive.id)}을(를) 석방합니다.`,
        preview: {
          title: `${getCharName(captive.id)} 석방`,
          lines: [
            '포로를 잃지만 비호전적 선택지입니다.',
            '특정 관계 이벤트의 씨앗이 될 수 있습니다.',
            '즉시 포로 목록에서 제거됩니다.',
          ],
        },
        disabled: noActions,
      }));
    }

    const myChars = state.getCharactersInCity(cityId).filter((char) => char.faction === state.player.factionId);
    const movableGenerals = myChars.filter((char) => char.id !== faction.leader);
    const lowLoyaltyChars = [...myChars]
      .filter((char) => char.id !== faction.leader)
      .sort((a, b) => (a.loyalty ?? 50) - (b.loyalty ?? 50) || b.stats.charisma - a.stats.charisma);
    const otherCities = state.getCitiesOfFaction(state.player.factionId).filter((targetCity) => targetCity.id !== cityId);
    const inboundCandidates = state.getCharactersOfFaction(state.player.factionId)
      .filter((char) => char.city !== cityId && char.id !== faction.leader)
      .sort((a, b) => (b.stats.politics + b.stats.command) - (a.stats.politics + a.stats.command));
    for (const candidate of inboundCandidates.slice(0, 4)) {
      const originCity = state.cities[candidate.city];
      if (!originCity) continue;
      const originChars = state.getCharactersInCity(originCity.id || candidate.city)
        .filter((char) => char.faction === state.player.factionId);
      assignmentEntries.push(this._makeEntry({
        actionType: 'move_general',
        params: { charId: candidate.id, fromCity: candidate.city, toCity: cityId },
        title: `${getCharName(candidate.id)} 호출`,
        subtitle: `${originCity.name} → ${city.name}`,
        detail: `정${candidate.stats.politics} 통${candidate.stats.command} · ${originCity.name} 장수 ${originChars.length}명`,
        cost: '행동력 1',
        effect: city.governor ? `${city.name} 인재층 보강` : `${city.name} 태수 후보 확보`,
        confirmText: `${getCharName(candidate.id)}를 ${originCity.name}에서 ${city.name}으로 불러옵니다.`,
        preview: {
          title: `${getCharName(candidate.id)} 호출`,
          lines: [
            `${originCity.name} → ${city.name}`,
            `현재 ${originCity.name} 병력 ${formatNumber(originCity.army)} · 장수 ${originChars.length}명`,
            city.governor ? `${city.name} 전선 장수층을 보강합니다.` : `${city.name}은 태수 공석이라 정치 장수가 특히 중요합니다.`,
          ],
        },
        disabled: noActions,
      }));
    }
    for (const general of movableGenerals.slice(0, 5)) {
      for (const targetCity of otherCities.slice(0, 2)) {
        const targetChars = state.getCharactersInCity(targetCity.id).filter((char) => char.faction === state.player.factionId);
        assignmentEntries.push(this._makeEntry({
          actionType: 'move_general',
          params: { charId: general.id, fromCity: cityId, toCity: targetCity.id },
          title: `${getCharName(general.id)} 이동`,
          subtitle: `${city.name} → ${targetCity.name}`,
          detail: `통${general.stats.command} 무${general.stats.war} 지${general.stats.intellect} · ${targetCity.name} 장수 ${targetChars.length}명`,
          cost: '행동력 1',
          effect: `${targetCity.name} 인재층 조정`,
          confirmText: `${getCharName(general.id)}를 ${targetCity.name}으로 이동합니다.`,
          preview: {
            title: `${getCharName(general.id)} 배치`,
            lines: [
              `${city.name}에서 ${targetCity.name}으로 이동`,
              `능력치: 통${general.stats.command} 무${general.stats.war} 지${general.stats.intellect} 정${general.stats.politics} 매${general.stats.charisma}`,
              `${targetCity.name} 현재 병력 ${formatNumber(targetCity.army)} · 장수 ${targetChars.length}명`,
            ],
          },
          disabled: noActions,
        }));
      }
    }

    const governorCandidates = myChars.filter((char) => char.id !== city.governor);
    for (const candidate of governorCandidates.slice(0, 4)) {
      assignmentEntries.push(this._makeEntry({
        actionType: 'appoint_governor',
        params: { charId: candidate.id, cityId },
        title: `${getCharName(candidate.id)} 태수 임명`,
        subtitle: `정${candidate.stats.politics} · 매${candidate.stats.charisma}`,
        detail: '도시 예측과 내정 효율이 직접 달라집니다.',
        cost: '행동력 1',
        effect: `${city.name}의 월간 예측 변화`,
        confirmText: `${getCharName(candidate.id)}를 ${city.name} 태수로 임명합니다.`,
        preview: {
          title: `${getCharName(candidate.id)} 태수 임명`,
          lines: [
            `정치 ${candidate.stats.politics} · 매력 ${candidate.stats.charisma}`,
            '태수는 도시의 성장 추천과 체감에 직접 반영됩니다.',
            `현재 태수 ${city.governor ? getCharName(city.governor) : '없음'}`,
          ],
        },
        disabled: noActions,
      }));
    }

    for (const candidate of lowLoyaltyChars.slice(0, 3)) {
      rewardEntries.push(this._makeEntry({
        actionType: 'reward_officer',
        params: { charId: candidate.id, goldCost: 1000 },
        title: `${getCharName(candidate.id)} 포상`,
        subtitle: `충성 ${Math.round(candidate.loyalty ?? 50)} · 금 1,000`,
        detail: '장수의 불만을 누그러뜨리고 배신 위험을 줄입니다.',
        cost: '금 1,000',
        effect: `예상 충성 +10~14`,
        confirmText: `${getCharName(candidate.id)}에게 포상을 내려 충성을 높입니다.`,
        preview: {
          title: `${getCharName(candidate.id)} 포상`,
          lines: [
            `현재 충성 ${Math.round(candidate.loyalty ?? 50)}`,
            '낮은 충성 장수일수록 즉시 체감이 큽니다.',
            `세력 자금 ${faction.gold.toLocaleString()} 보유`,
          ],
        },
        disabled: noActions || faction.gold < 1000 || (candidate.loyalty ?? 50) >= 95,
      }));
    }

    const dismissalCandidates = [...myChars]
      .filter((char) => char.id !== faction.leader)
      .sort((a, b) => (a.loyalty ?? 50) - (b.loyalty ?? 50) || totalStats(a.stats) - totalStats(b.stats));
    for (const candidate of dismissalCandidates.slice(0, 2)) {
      const roleNotes = getOfficerRoleBadges(candidate, city, faction, currentTactician)
        .map((badge) => badge.text)
        .join(' · ') || '일반 장수';
      rewardEntries.push(this._makeEntry({
        actionType: 'dismiss_officer',
        params: { charId: candidate.id, cityId },
        title: `${getCharName(candidate.id)} 해임`,
        subtitle: `${roleNotes} · 충성 ${Math.round(candidate.loyalty ?? 50)}`,
        detail: '세력에서 내보내 방랑 인재로 전환합니다. 평판이 하락합니다.',
        cost: '행동력 1',
        effect: '방랑 전환 · 평판 -8',
        confirmText: `${getCharName(candidate.id)}를 ${city.name}에서 해임합니다.`,
        preview: {
          title: `${getCharName(candidate.id)} 해임`,
          lines: [
            `${city.name}에서 이탈해 현지 방랑 인재가 됩니다.`,
            candidate.id === city.governor ? '현재 태수라 즉시 태수 공석이 발생합니다.' : `${city.name} 내부 인원 정리를 위한 선택입니다.`,
            candidate.id === currentTactician?.id ? '현재 세력 책사라 책사 직위도 공석이 됩니다.' : '세력 책사 직위에는 직접 영향이 없습니다.',
          ],
        },
        disabled: noActions || myChars.length <= 1,
      }));
    }

    const giftTargets = [...lowLoyaltyChars]
      .sort((a, b) => (a.loyalty ?? 50) - (b.loyalty ?? 50) || b.stats.intellect - a.stats.intellect);
    const inventoryItems = (faction.inventory || []).slice(0, 2);
    inventoryItems.forEach((itemId, index) => {
      const target = giftTargets[index];
      if (!target) return;
      rewardEntries.push(this._makeEntry({
        actionType: 'bestow_item',
        params: { charId: target.id, itemId },
        title: `${getCharName(target.id)}에게 ${getItemName(itemId)} 하사`,
        subtitle: `충성 ${Math.round(target.loyalty ?? 50)} · 보물 하사`,
        detail: '세력 인벤토리의 보물을 하사해 충성심과 전력을 함께 올립니다.',
        cost: '보물 1개',
        effect: `${getItemName(itemId)} 장착 · 충성 +12~18`,
        confirmText: `${getCharName(target.id)}에게 ${getItemName(itemId)}을(를) 하사합니다.`,
        preview: {
          title: `${getItemName(itemId)} 하사`,
          lines: [
            `${getCharName(target.id)}의 충성을 즉시 끌어올립니다.`,
            `현재 충성 ${Math.round(target.loyalty ?? 50)} · 대상 능력 총합 ${totalStats(target.stats)}`,
            '장비 슬롯이 교체될 수 있습니다.',
          ],
        },
        disabled: noActions,
      }));
    });

    const confiscationTargets = [...myChars]
      .filter((char) => char.equipment && Object.values(char.equipment).some(Boolean) && char.id !== faction.leader)
      .sort((a, b) => totalEquippedRarityScore(b) - totalEquippedRarityScore(a));
    for (const target of confiscationTargets.slice(0, 2)) {
      const slot = ['accessory', 'weapon', 'horse', 'armor'].find((candidate) => target.equipment?.[candidate]);
      if (!slot) continue;
      const itemId = target.equipment[slot];
      rewardEntries.push(this._makeEntry({
        actionType: 'confiscate_item',
        params: { charId: target.id, slot },
        title: `${getCharName(target.id)} 보물 회수`,
        subtitle: `${getItemName(itemId)} · 충성 하락`,
        detail: '하사품을 다시 세력 인벤토리로 회수해 다른 장수에게 돌릴 수 있습니다.',
        cost: '행동력 1',
        effect: `${getItemName(itemId)} 회수 · 예상 충성 -10~14`,
        confirmText: `${getCharName(target.id)}에게서 ${getItemName(itemId)}을(를) 회수합니다.`,
        preview: {
          title: `${getItemName(itemId)} 회수`,
          lines: [
            `${getCharName(target.id)}의 장비 슬롯에서 아이템을 해제합니다.`,
            `현재 충성 ${Math.round(target.loyalty ?? 50)} · 회수 후 충성 하락`,
            '회수한 아이템은 세력 인벤토리로 돌아갑니다.',
          ],
        },
        disabled: noActions,
      }));
    }

    const tacticianCandidates = state.getCharactersOfFaction(state.player.factionId)
      .sort((a, b) => b.stats.intellect - a.stats.intellect || b.stats.politics - a.stats.politics)
      .filter((char) => char.id !== currentTactician?.id);
    for (const candidate of tacticianCandidates.slice(0, 3)) {
      rewardEntries.push(this._makeEntry({
        actionType: 'appoint_tactician',
        params: { charId: candidate.id },
        title: `${getCharName(candidate.id)} 책사 임명`,
        subtitle: `지${candidate.stats.intellect} · 정${candidate.stats.politics}`,
        detail: '외교와 첩보, 장면 브리핑에 책사 보정과 조언이 반영됩니다.',
        cost: '행동력 1',
        effect: '세력 책사 교체',
        confirmText: `${getCharName(candidate.id)}를 세력 책사로 임명합니다.`,
        preview: {
          title: `${getCharName(candidate.id)} 책사 임명`,
          lines: [
            `지력 ${candidate.stats.intellect} · 정치 ${candidate.stats.politics}`,
            currentTactician ? `현재 책사 ${getCharName(currentTactician.id)}` : '현재 지정된 책사가 없습니다.',
            '외교·첩보 판정과 브리핑 품질에 영향을 줍니다.',
          ],
        },
        disabled: noActions,
      }));
    }

    const topCommander = [...myChars].sort((a, b) => b.stats.command - a.stats.command)[0];
    const topScholar = currentTactician || [...myChars].sort((a, b) => b.stats.intellect - a.stats.intellect)[0];
    const bestGovernorCandidates = [...myChars]
      .sort((a, b) => (b.stats.politics + b.stats.charisma) - (a.stats.politics + a.stats.charisma))
      .slice(0, 3);
    const transferRoutes = [
      ...inboundCandidates.slice(0, 2).map((candidate) => {
        const originCity = state.cities[candidate.city];
        return originCity ? `${originCity.name}의 ${getCharName(candidate.id)} 호출` : null;
      }),
      ...movableGenerals.slice(0, 2).map((candidate) => {
        const targetCity = otherCities[0];
        return targetCity ? `${getCharName(candidate.id)} → ${targetCity.name} 재배치` : null;
      }),
    ].filter(Boolean);
    container.appendChild(this._createSceneHero('personnel', {
      kicker: '인사 장면',
      title: `${city.name} 인재 명부`,
      summary: `${city.name}에 머무는 장수와 포로, 방랑 인재를 정리하고 다음 턴의 지휘 체계를 배치합니다.`,
      pills: [
        { label: '태수', value: city.governor ? getCharName(city.governor) : '공석' },
        { label: '장수', value: `${myChars.length}명` },
        { label: '포로', value: `${captives.length}명` },
        { label: '책사', value: topScholar ? getCharName(topScholar.id) : `${wanderers.length}명` },
      ],
      asideTitle: '인재 메모',
      asideLines: [
        topCommander ? `최고 지휘: ${getCharName(topCommander.id)} · 통솔 ${topCommander.stats.command}` : '지휘 장수 데이터가 없습니다.',
        topScholar ? `최고 책사: ${getCharName(topScholar.id)} · 지력 ${topScholar.stats.intellect}` : '책사 장수 데이터가 없습니다.',
        lowLoyaltyChars[0] ? `주의 장수: ${getCharName(lowLoyaltyChars[0].id)} · 충성 ${Math.round(lowLoyaltyChars[0].loyalty ?? 50)}` : '이번 턴은 충성 위기 장수가 두드러지지 않습니다.',
        dismissalCandidates[0]
          ? `${getCharName(dismissalCandidates[0].id)} 정리가 가능하며 세력 평판 -8이 예상됩니다.`
          : (confiscationTargets[0] ? `${getCharName(confiscationTargets[0].id)}의 하사품 회수가 가능합니다.` : (wanderers.length > 0 ? `${city.name} 근처에 방랑 인재 ${wanderers.length}명이 감지됩니다.` : '이번 턴은 내부 배치와 태수 교체에 집중할 수 있습니다.')),
      ],
    }));

    const board = document.createElement('div');
    board.className = 'command-scene-grid personnel-grid';
    board.appendChild(this._createPersonnelManagementBoard({
      city,
      currentTactician,
      topCommander,
      topScholar,
      bestGovernorCandidates,
      transferRoutes,
      lowLoyaltyChars,
      wanderers,
      captives,
    }));
    board.appendChild(this._createOfficerLedgerSection(city, myChars, faction, currentTactician));
    board.appendChild(this._createSceneSection('인재 탐색', '새 장수 발견', searchEntries, 'compact', 'personnel-search'));
    board.appendChild(this._createSceneSection('포로 처리', captives.length ? `${captives.length}명 보유` : '보유 포로 없음', captivesEntries, 'compact', 'personnel-captive'));
    board.appendChild(this._createSceneSection('포상과 징계', '충성·하사·해임', rewardEntries, 'compact', 'personnel-reward'));
    board.appendChild(this._createSceneSection('배치와 임명', '장수 이동·태수 교체', assignmentEntries, '', 'personnel-assign', true));
    container.appendChild(board);
  }

  _createPersonnelManagementBoard({
    city,
    currentTactician,
    topCommander,
    topScholar,
    bestGovernorCandidates,
    transferRoutes,
    lowLoyaltyChars,
    wanderers,
    captives,
  }) {
    const section = document.createElement('section');
    section.className = 'command-scene-section personnel-management-board variant-personnel-command';
    section.innerHTML = `
      <div class="command-scene-section-head">
        <div class="command-scene-section-kicker">임명 · 배치 · 감찰</div>
        <h3>${city.name} 인사 운영판</h3>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'personnel-management-grid';
    grid.innerHTML = `
      <article class="personnel-management-card">
        <div class="personnel-management-label">현재 직위</div>
        <h4>지휘 체계</h4>
        <ul class="personnel-management-list">
          <li>태수: ${city.governor ? getCharName(city.governor) : '공석'}</li>
          <li>책사: ${currentTactician ? getCharName(currentTactician.id) : '공석'}</li>
          <li>현지 지휘: ${topCommander ? `${getCharName(topCommander.id)} · 통솔 ${topCommander.stats.command}` : '주력 장수 없음'}</li>
        </ul>
      </article>
      <article class="personnel-management-card">
        <div class="personnel-management-label">추천 임명</div>
        <h4>태수 후보</h4>
        <ul class="personnel-management-list">
          ${bestGovernorCandidates.length
            ? bestGovernorCandidates.map((candidate) => `<li>${getCharName(candidate.id)} · 정${candidate.stats.politics} 매${candidate.stats.charisma}</li>`).join('')
            : '<li>추천 후보 없음</li>'}
        </ul>
      </article>
      <article class="personnel-management-card">
        <div class="personnel-management-label">배치 구상</div>
        <h4>이동 제안</h4>
        <ul class="personnel-management-list">
          ${transferRoutes.length ? transferRoutes.map((line) => `<li>${line}</li>`).join('') : '<li>이번 턴은 현지 정비 우선</li>'}
        </ul>
      </article>
      <article class="personnel-management-card tone-alert">
        <div class="personnel-management-label">감찰 메모</div>
        <h4>주의 대상</h4>
        <ul class="personnel-management-list">
          <li>${lowLoyaltyChars[0] ? `${getCharName(lowLoyaltyChars[0].id)} · 충성 ${Math.round(lowLoyaltyChars[0].loyalty ?? 50)}` : '즉시 포상 대상 없음'}</li>
          <li>${captives.length ? `포로 ${captives.length}명 관리 필요` : '포로 관리 부담 없음'}</li>
          <li>${wanderers.length ? `방랑 인재 ${wanderers.length}명 감지` : '현지 방랑 인재 감지 없음'}</li>
          <li>${topScholar ? `책사 후보 ${getCharName(topScholar.id)} · 지력 ${topScholar.stats.intellect}` : '책사 후보 없음'}</li>
        </ul>
      </article>
    `;

    section.appendChild(grid);
    return section;
  }

  _createOfficerLedgerSection(city, officers, faction, currentTactician) {
    const section = document.createElement('section');
    section.className = 'command-scene-section officer-ledger-section variant-personnel-ledger';
    section.innerHTML = `
      <div class="command-scene-section-head">
        <div class="command-scene-section-kicker">현지 장수 현황</div>
        <h3>${city.name} 인재 장부</h3>
      </div>
    `;

    const ledger = document.createElement('div');
    ledger.className = 'officer-ledger-grid';

    const sorted = [...officers]
      .sort((a, b) => officerLedgerPriority(b, city, faction, currentTactician) - officerLedgerPriority(a, city, faction, currentTactician));

    if (!sorted.length) {
      const empty = document.createElement('div');
      empty.className = 'command-scene-empty';
      empty.textContent = '현재 이 도시에 등록된 장수가 없습니다.';
      ledger.appendChild(empty);
    }

    sorted.slice(0, 6).forEach((officer) => {
      const badges = getOfficerRoleBadges(officer, city, faction, currentTactician);
      const card = document.createElement('article');
      card.className = 'officer-ledger-card';
      card.innerHTML = `
        <div class="officer-ledger-head">
          <div>
            <div class="officer-ledger-name">${getCharName(officer.id)}</div>
            <div class="officer-ledger-sub">${badges.length ? badges.map((badge) => badge.text).join(' · ') : '현지 장수'}</div>
          </div>
          <div class="officer-ledger-loyalty">충성 ${Math.round(officer.loyalty ?? 50)}</div>
        </div>
        <div class="officer-ledger-badges">
          ${badges.map((badge) => `<span class="officer-ledger-badge tone-${badge.tone}">${badge.text}</span>`).join('')}
        </div>
        <div class="officer-ledger-stats">
          <span>통 ${officer.stats.command}</span>
          <span>지 ${officer.stats.intellect}</span>
          <span>정 ${officer.stats.politics}</span>
          <span>매 ${officer.stats.charisma}</span>
        </div>
      `;
      ledger.appendChild(card);
    });

    section.appendChild(ledger);
    return section;
  }

  _createSceneSection(title, kicker, entries, compact = '', variant = '', showOpeningRail = false) {
    const section = document.createElement('section');
    const enabledCount = entries.filter((entry) => !entry.disabled).length;
    const sectionId = variant || createSectionKey(title);
    const firstEnabledEntry = entries.find((entry) => !entry.disabled);
    section.dataset.sectionId = sectionId;
    section.dataset.sectionTitle = title;
    section.dataset.sectionCount = formatSectionCount(enabledCount, entries.length);
    if (firstEnabledEntry?.key) section.dataset.firstCommandKey = firstEnabledEntry.key;
    section.className = `command-scene-section${compact ? ` ${compact}` : ''}${variant ? ` variant-${variant}` : ''}`;
    section.innerHTML = `
      <div class="command-scene-section-head">
        <div class="command-scene-section-kicker">${kicker}</div>
        <div class="command-scene-section-titlebar">
          <h3>${title}</h3>
          <span class="command-scene-section-badge">${formatSectionCount(enabledCount, entries.length)}</span>
        </div>
      </div>
    `;

    const list = document.createElement('div');
    list.className = 'command-entry-list';
    const normalizedEntries = entries.map((entry) => ({ ...entry, sectionId }));
    const explicitPriority = normalizedEntries.some((entry) => entry.priorityLabel);
    if (!explicitPriority) {
      const enabledIndices = normalizedEntries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => !entry.disabled);
      if (enabledIndices[0]) {
        normalizedEntries[enabledIndices[0].index].priorityLabel = '추천';
        normalizedEntries[enabledIndices[0].index].priorityTone = 'recommended';
      }
      if (enabledIndices[1]) {
        normalizedEntries[enabledIndices[1].index].priorityLabel = '대안';
        normalizedEntries[enabledIndices[1].index].priorityTone = 'alternate';
      }
    }
    const openingRecommendations = this._openingContext.active && showOpeningRail
      ? normalizedEntries.filter((entry) => !entry.disabled).slice(0, 2)
      : [];
    if (openingRecommendations.length > 0) {
      const rail = document.createElement('div');
      rail.className = 'opening-command-rail';
      const beat = getOpeningActBeat(this._openingContext.factionId, this._openingContext.turn);
      const sceneNames = {
        government: '시정 장면',
        military: '군사 장면',
        diplomacy: '외교 장면',
        personnel: '인사 장면',
      };
      rail.innerHTML = `
        <div class="opening-command-rail-head">
          <span class="opening-command-rail-kicker">오프닝 액트 ${this._openingContext.turn}</span>
          <strong>${beat?.title || '지금 눌러야 하는 명령'}</strong>
          ${beat?.preferredScene ? `<span class="opening-command-scene-hint">우선 장면: ${sceneNames[beat.preferredScene] || beat.preferredScene}</span>` : ''}
        </div>
      `;
      const chipWrap = document.createElement('div');
      chipWrap.className = 'opening-command-chip-wrap';
      for (const entry of openingRecommendations) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `opening-command-chip${entry.priorityTone ? ` tone-${entry.priorityTone}` : ''}`;
        chip.innerHTML = `
          <span class="opening-command-chip-label">${entry.priorityLabel || '추천'}</span>
          <span class="opening-command-chip-title">${entry.title}</span>
          <span class="opening-command-chip-copy">${entry.decisionNote || entry.effect || entry.subtitle || ''}</span>
        `;
        chip.addEventListener('click', () => {
          if (entry.disabled) return;
          this._pendingAction = entry;
          this._refreshSelectionUI();
        });
        chipWrap.appendChild(chip);
      }
      rail.appendChild(chipWrap);
      section.appendChild(rail);
    }
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'command-scene-empty';
      empty.textContent = '현재 선택 가능한 명령이 없습니다.';
      list.appendChild(empty);
    } else {
      const foldable = normalizedEntries.length > 3;
      const visibleEntries = foldable ? normalizedEntries.slice(0, 2) : normalizedEntries;
      const foldedEntries = foldable ? normalizedEntries.slice(2) : [];

      const featureWrap = document.createElement('div');
      featureWrap.className = 'command-entry-featured';
      visibleEntries.forEach((entry) => {
        this._entries.push(entry);
        featureWrap.appendChild(this._createEntryCard(entry, true));
      });
      list.appendChild(featureWrap);

      if (foldedEntries.length > 0) {
        const fold = document.createElement('details');
        fold.className = 'command-entry-fold';
        fold.innerHTML = `
          <summary>
            <span class="command-entry-fold-label">나머지 ${foldedEntries.length}개 명령</span>
            <span class="command-entry-fold-copy">지금은 핵심 카드만 먼저 보여줍니다</span>
          </summary>
        `;
        const foldList = document.createElement('div');
        foldList.className = 'command-entry-fold-list';
        foldedEntries.forEach((entry) => {
          this._entries.push(entry);
          foldList.appendChild(this._createEntryCard(entry));
        });
        fold.appendChild(foldList);
        list.appendChild(fold);
      }
    }
    section.appendChild(list);
    return section;
  }

  _createEntryCard(entry, featured = false) {
    const card = document.createElement('button');
    card.className = `command-entry-card${featured ? ' featured' : ''}${entry.disabled ? ' disabled' : ''}${entry.priorityTone ? ` tone-${entry.priorityTone}` : ''}`;
    card.dataset.commandKey = entry.key;
    card.disabled = !!entry.disabled;
    card.innerHTML = `
      <div class="command-entry-top">
        <div class="command-entry-title-wrap">
          <div class="command-entry-title">${entry.title}</div>
          ${entry.priorityLabel ? `<span class="command-entry-priority tone-${entry.priorityTone || 'recommended'}">${entry.priorityLabel}</span>` : ''}
        </div>
        <div class="command-entry-cost">${entry.cost || '행동력 1'}</div>
      </div>
      <div class="command-entry-subtitle">${entry.subtitle || ''}</div>
      <div class="command-entry-detail">${entry.detail || ''}</div>
      <div class="command-entry-effect">${entry.effect || ''}</div>
      ${entry.decisionNote ? `<div class="command-entry-note">${entry.decisionNote}</div>` : ''}
      ${!entry.disabled ? '<div class="command-entry-confirm-hint">Enter · 지금 확정</div>' : ''}
      ${featured && !entry.disabled ? '<div class="command-entry-shortcut">두 번 · 즉시 확정</div>' : ''}
    `;
    card.addEventListener('mouseenter', () => {
      if (entry.disabled || this._pendingAction) return;
      this._previewAction = entry;
      this._refreshSelectionUI();
    });
    card.addEventListener('focus', () => {
      if (entry.disabled || this._pendingAction) return;
      this._previewAction = entry;
      this._refreshSelectionUI();
    });
    card.addEventListener('mouseleave', () => {
      if (this._pendingAction || this._previewAction?.key !== entry.key) return;
      this._previewAction = null;
      this._refreshSelectionUI();
    });
    card.addEventListener('blur', () => {
      if (this._pendingAction || this._previewAction?.key !== entry.key) return;
      this._previewAction = null;
      this._refreshSelectionUI();
    });
    card.addEventListener('click', () => {
      if (entry.disabled) return;
      this._pendingAction = entry;
      this._previewAction = entry;
      this._refreshSelectionUI();
    });
    card.addEventListener('dblclick', () => {
      if (entry.disabled) return;
      this._pendingAction = entry;
      this._previewAction = entry;
      this._refreshSelectionUI();
      this.confirmSelection();
    });
    return card;
  }

  _makeEntry(entry) {
    return {
      key: createCommandKey(entry),
      preview: entry.preview || { title: entry.title, lines: [] },
      confirmText: entry.confirmText,
      ...entry,
    };
  }

  _getFriendlyNeighbors(cityId, state) {
    const result = [];
    for (const [a, b] of this._connections) {
      const neighbor = a === cityId ? b : b === cityId ? a : null;
      if (!neighbor) continue;
      if (state.cities[neighbor]?.owner === state.player.factionId) result.push(neighbor);
    }
    return result;
  }

  _getEnemyNeighbors(cityId, state) {
    const result = [];
    for (const [a, b] of this._connections) {
      const neighbor = a === cityId ? b : b === cityId ? a : null;
      if (!neighbor) continue;
      const city = state.cities[neighbor];
      if (city?.owner && city.owner !== state.player.factionId && state.isAtWar(state.player.factionId, city.owner)) {
        result.push(neighbor);
      }
    }
    return result;
  }

  _getNonHostileNeighborFactions(cityId, state) {
    const factions = new Set();
    for (const [a, b] of this._connections) {
      const neighbor = a === cityId ? b : b === cityId ? a : null;
      if (!neighbor) continue;
      const city = state.cities[neighbor];
      if (city?.owner && city.owner !== state.player.factionId && !state.isAtWar(state.player.factionId, city.owner)) {
        factions.add(city.owner);
      }
    }
    return [...factions];
  }

  _getFriendlyNeighborApproaches(cityId, state) {
    const cities = [];
    for (const [a, b] of this._connections) {
      const neighbor = a === cityId ? b : b === cityId ? a : null;
      if (!neighbor) continue;
      if (state.cities[neighbor]?.owner === state.player.factionId) cities.push(neighbor);
    }
    return cities;
  }
}

function renderCommandSummary(city, ownerName, forecast, state, director = null) {
  const owner = ownerName || '무주지';
  const actionHint = city.owner === state.player.factionId
    ? forecast.recommendations[0] || '이번 달 주력 명령을 고르십시오.'
    : '군사와 외교를 바로 눌러볼 수 있습니다.';
  const summaryItems = (director?.status || [
    ['거점', city.name],
    ['지배', owner],
    ['병력', formatNumber(city.army)],
    ['성방 / 사기', `${formatNumber(asNumber(city.defense))} / ${formatNumber(asNumber(city.morale))}`],
    ['월간 수지', `${signed(forecast.goldDelta)} 금 · ${signed(forecast.foodDelta)} 식량`],
    ['이번 턴 권고', actionHint],
  ]).map(([label, value], index) => [label, value, index === 0 ? 'command-summary-card-primary' : index === 5 ? 'command-summary-card-wide' : '']);
  return summaryItems.map(([label, value, className]) => `
    <div class="command-summary-card ${className}">
      <div class="command-summary-label">${label}</div>
      <div class="command-summary-value">${value}</div>
    </div>
  `).join('');
}

function renderCommandSealDocket({
  city = null,
  sceneMeta = null,
  director = null,
  battlefieldDirector = null,
  recommendedSceneMeta = null,
  pendingAction = null,
  previewAction = null,
  actionsRemaining = 0,
} = {}) {
  const state = pendingAction ? 'decision' : previewAction ? 'preview' : 'brief';
  const statusLabel = pendingAction
    ? '확정 대기'
    : previewAction
      ? '후보 확인'
      : '선택 대기';
  const focusEntry = pendingAction || previewAction || null;
  const decisionLine = director?.status?.find?.(([label]) => label === '결정')?.[1]
    || director?.status?.find?.(([label]) => label === '권고')?.[1]
    || battlefieldDirector?.action
    || sceneMeta?.placeholderCopy
    || '이번 턴 결정 대기';
  const focusTitle = focusEntry?.title || `${sceneMeta?.name || '명령'} 장면에서 이번 턴 결정을 고릅니다`;
  const focusCopy = pendingAction
    ? pendingAction.confirmText || '지금 확정하면 행동력이 소모되고 이번 턴에 즉시 반영됩니다.'
    : previewAction
      ? previewAction.detail || previewAction.subtitle || '이 후보를 결정 패널에 올려 곧바로 확정할 수 있습니다.'
      : decisionLine;
  const mapReadout = battlefieldDirector?.mapReadout
    || battlefieldDirector?.sessionTrace?.mapReadout
    || director?.subhead
    || sceneMeta?.placeholderCopy
    || '지도 판독 대기';
  const sceneDetail = recommendedSceneMeta && recommendedSceneMeta.name !== sceneMeta?.name
    ? `권장 흐름 ${recommendedSceneMeta.name}`
    : '현재 장면에서 바로 결정';
  const sealDetail = pendingAction
    ? pendingAction.cost || '행동력 1'
    : previewAction
      ? 'Enter로 바로 확정'
      : '왼쪽 카드 선택';
  const commitLabel = pendingAction ? '즉시 확정' : previewAction ? '후보 확인' : '선택 대기';
  const commitTitle = pendingAction
    ? `${focusEntry?.title || sceneMeta?.name || '명령'} 확정 대기`
    : previewAction
      ? `${focusEntry?.title || sceneMeta?.name || '명령'} 실행 후보 대기`
      : `${sceneMeta?.name || '명령'} 카드 선택 대기`;
  const commitCopy = pendingAction
    ? '하단 결정 버튼이나 Enter로 이번 턴 선택을 바로 확정합니다.'
    : previewAction
      ? '왼쪽 카드가 결정 패널을 바꿨습니다. Enter로 곧바로 턴 결정을 올릴 수 있습니다.'
      : '왼쪽 카드 하나를 누르면 이 보드가 즉시 턴 결정으로 바뀝니다.';

  return `
    <section class="command-seal-docket tone-${state}">
      <div class="command-seal-docket-head">
        <div class="command-seal-docket-heading">
          <span class="command-seal-docket-kicker">결정 보드</span>
          <strong>확정 단계</strong>
        </div>
        <span class="command-seal-docket-state">${statusLabel}</span>
      </div>
      <div class="command-seal-focus">
        <span class="command-seal-focus-label">${pendingAction ? '즉시 확정' : previewAction ? '올라온 후보' : '이번 턴 판단'}</span>
        <strong>${focusTitle}</strong>
        <p>${focusCopy}</p>
      </div>
      <div class="command-seal-grid">
        <article class="command-seal-card">
          <span class="command-seal-card-label">거점</span>
          <strong>${city?.name || '도시 미선택'}</strong>
          <small>${battlefieldDirector?.objective || director?.headline || '선택 도시에서 바로 결정을 시작합니다.'}</small>
        </article>
        <article class="command-seal-card">
          <span class="command-seal-card-label">장면</span>
          <strong>${sceneMeta?.name || '명령'}</strong>
          <small>${sceneDetail}</small>
        </article>
        <article class="command-seal-card">
          <span class="command-seal-card-label">확정</span>
          <strong>${pendingAction ? '지금 확정' : previewAction ? '후보 올림' : '선택 대기'}</strong>
          <small>${sealDetail}</small>
        </article>
        <article class="command-seal-card">
          <span class="command-seal-card-label">행동력</span>
          <strong>${actionsRemaining} 남음</strong>
          <small>${actionsRemaining > 0 ? '이번 턴 추가 명령 여지' : '이번 턴 행동 종료 상태'}</small>
        </article>
        <article class="command-seal-card command-seal-card-wide">
          <span class="command-seal-card-label">판독 → 결정</span>
          <strong>${truncateBridgeLine(mapReadout, 84)}</strong>
          <small>${truncateBridgeLine(focusEntry?.effect || focusEntry?.decisionNote || decisionLine, 120)}</small>
        </article>
      </div>
      <div class="command-seal-commit">
        <span class="command-seal-commit-label">${commitLabel}</span>
        <strong>${commitTitle}</strong>
        <small>${commitCopy}</small>
      </div>
    </section>
  `;
}

function buildCommandStrikeCards({
  context = 'candidate',
  mode = 'brief',
  sceneMeta = null,
  city = null,
  entry = null,
  actionsRemaining = 0,
  selectableCount = 0,
  decisionLine = '',
  mapReadout = '',
  battlefieldDirector = null,
  recommendedSceneMeta = null,
  candidateTitle = '',
  candidateCopy = '',
  commitTitle = '',
  commitCopy = '',
} = {}) {
  const isDecision = mode === 'decision';
  const isPreview = mode === 'preview';
  const sceneName = sceneMeta?.name || '명령';
  const routeScene = recommendedSceneMeta && recommendedSceneMeta.name !== sceneName
    ? `${sceneName} -> ${recommendedSceneMeta.name}`
    : `${sceneName} -> 턴 확정`;
  const actionWindow = actionsRemaining > 0
    ? `${actionsRemaining} 행동 남음${selectableCount > 0 && !entry ? ` · ${selectableCount}개 카드` : ''}`
    : '행동력 0 · 턴 종료선';
  const targetLine = battlefieldDirector?.objective
    || battlefieldDirector?.focus
    || decisionLine
    || candidateTitle
    || '전장 축 정리 중';
  const riskLine = battlefieldDirector?.risk
    || battlefieldDirector?.whyNow
    || mapReadout
    || '리스크 판독 대기';
  const effectLine = entry?.effect
    || entry?.decisionNote
    || entry?.confirmText
    || entry?.detail
    || entry?.subtitle
    || decisionLine
    || sceneMeta?.placeholderCopy
    || '즉시 효과 판독 대기';
  const routeLine = isDecision
    ? `${entry?.title || sceneName} -> Enter -> 턴 확정`
    : isPreview
      ? `${entry?.title || sceneName} 후보 -> Enter -> 턴 확정`
      : routeScene;

  if (context === 'lane') {
    return [
      {
        label: '지도 판독',
        value: mapReadout || '지도 판독 대기',
        note: battlefieldDirector?.risk || battlefieldDirector?.whyNow || '전장 압박 축을 먼저 읽습니다.',
        tone: 'primary',
      },
      {
        label: entry ? '올라온 카드' : '실행 후보',
        value: candidateTitle || `${sceneName} 카드 선택 대기`,
        note: candidateCopy || '카드 선택 직후 이 칸이 즉시 바뀝니다.',
        tone: entry ? 'effect' : 'window',
      },
      {
        label: '행동 창',
        value: actionWindow,
        note: recommendedSceneMeta?.name && recommendedSceneMeta.name !== sceneName
          ? `현재 ${sceneName} · 권장 ${recommendedSceneMeta.name}`
          : `${sceneName} 장면에서 바로 결정`,
        tone: 'window',
      },
      {
        label: '턴 확정',
        value: commitTitle || routeLine,
        note: commitCopy || 'Enter 또는 하단 결정 버튼으로 이번 턴을 잠급니다.',
        tone: 'route',
      },
    ];
  }

  return [
    {
      label: isDecision ? '확정 목표' : '지금 목표',
      value: targetLine,
      note: city?.name || '도시 미선택',
      tone: 'primary',
    },
    {
      label: '리스크',
      value: riskLine,
      note: battlefieldDirector?.whyNow || mapReadout || '판독 축 정리 중',
      tone: 'risk',
    },
    entry
      ? {
          label: '즉시 효과',
          value: effectLine,
          note: entry.cost || actionWindow,
          tone: 'effect',
        }
      : {
          label: '행동 창',
          value: actionWindow,
          note: selectableCount > 0
            ? `${selectableCount}개 카드 중 첫 결정을 고르십시오.`
            : '실행 카드 준비 중',
          tone: 'window',
        },
    {
      label: '확정선',
      value: routeLine,
      note: isDecision
        ? 'Enter 또는 하단 결정 버튼'
        : isPreview
          ? '후보를 한 번 더 잠그면 바로 확정'
          : routeScene,
      tone: 'route',
    },
  ];
}

function renderCommandStrikeStrip(cards = [], { tone = 'neutral', state = 'brief', context = 'candidate' } = {}) {
  if (!cards.length) return '';
  const valueMax = context === 'lane' ? 46 : 56;
  const noteMax = context === 'lane' ? 78 : 84;
  return `
    <div class="command-strike-strip tone-${tone}" data-state="${state}" data-context="${context}">
      ${cards.map((card) => `
        <article class="command-strike-card tone-${card.tone || 'steady'}">
          <span class="command-strike-label">${card.label}</span>
          <strong>${truncateBridgeLine(card.value || '', valueMax)}</strong>
          ${card.note ? `<small>${truncateBridgeLine(card.note, noteMax)}</small>` : ''}
        </article>
      `).join('')}
    </div>
  `;
}

function renderCommandCandidateLive({
  mode = 'brief',
  sceneId = null,
  sceneMeta = null,
  city = null,
  entry = null,
  actionsRemaining = 0,
  selectableCount = 0,
  director = null,
  battlefieldDirector = null,
  recommendedSceneMeta = null,
} = {}) {
  const tone = entry ? getCommandPreviewTone(entry) : sceneId || 'neutral';
  const isDecision = mode === 'decision';
  const isPreview = mode === 'preview';
  const decisionLine = director?.status?.find?.(([label]) => label === '다음 행동')?.[1]
    || director?.status?.find?.(([label]) => label === '결정')?.[1]
    || director?.status?.find?.(([label]) => label === '권고')?.[1]
    || battlefieldDirector?.action
    || sceneMeta?.placeholderCopy
    || '카드를 고르면 결정 패널가 바로 반응합니다.';
  const mapReadout = battlefieldDirector?.mapReadout
    || battlefieldDirector?.sessionTrace?.mapReadout
    || director?.subhead
    || sceneMeta?.placeholderCopy
    || '지도 판독 대기';
  const sceneRoute = recommendedSceneMeta && recommendedSceneMeta.name !== sceneMeta?.name
    ? `${sceneMeta?.name || '명령'} · 권장 ${recommendedSceneMeta.name}`
    : `${sceneMeta?.name || '명령'} 장면 고정`;
  const stateLabel = isDecision
    ? '즉시 집행'
    : isPreview
      ? '후보 잠금'
      : '첫 카드';
  const headline = isDecision
    ? '이번 턴에 내릴 명령이 정해졌습니다'
    : isPreview
      ? '이 후보를 실행할지 바로 고르십시오'
      : '카드를 골라 이번 턴 명령을 정하십시오';
  const focusTitle = isDecision
    ? `${entry?.title || sceneMeta?.name || '명령'} 실행 준비`
    : isPreview
      ? `${entry?.title || sceneMeta?.name || '명령'} 후보`
      : entry
        ? `${entry.title}부터 이번 턴 명령을 시작합니다`
        : `${sceneMeta?.name || '명령'}에서 명령을 고르십시오`;
  const focusCopy = isDecision
    ? entry?.confirmText || entry?.decisionNote || entry?.effect || entry?.detail || '지금 Enter를 누르면 이번 턴에 즉시 반영됩니다.'
    : isPreview
      ? entry?.detail || entry?.decisionNote || entry?.subtitle || entry?.effect || '후보가 올라왔습니다. 확인한 뒤 바로 확정할 수 있습니다.'
      : entry?.decisionNote || entry?.effect || '왼쪽 카드 하나를 누르면 이번 턴 명령 후보가 바로 올라갑니다.';
  const chips = [
    ['거점', city?.name || '도시 미선택'],
    ['장면', sceneRoute],
    ['행동력', `${actionsRemaining} 남음`],
    [isDecision || isPreview ? '확정' : '후보', isDecision
      ? entry?.cost || '행동력 1'
      : isPreview
        ? truncateBridgeLine(entry?.effect || entry?.decisionNote || entry?.subtitle || 'Enter로 바로 확정', 24)
        : `${selectableCount}개 카드`],
  ];
  const commitTitle = isDecision
    ? 'Enter 또는 하단 결정 버튼으로 바로 실행'
    : isPreview
      ? 'Enter로 이 후보를 바로 확정'
      : '카드를 고르면 바로 실행 준비가 됩니다';
  const commitCopy = isDecision
    ? truncateBridgeLine(decisionLine, 112)
    : isPreview
      ? truncateBridgeLine(mapReadout, 112)
      : truncateBridgeLine(decisionLine, 112);
  const strikeCards = buildCommandStrikeCards({
    context: 'candidate',
    mode,
    sceneMeta,
    city,
    entry,
    actionsRemaining,
    selectableCount,
    decisionLine,
    mapReadout,
    battlefieldDirector,
    recommendedSceneMeta,
  });

  return `
    <section class="command-candidate-live tone-${tone}" data-state="${mode}">
      <div class="command-candidate-live-head">
        <div class="command-candidate-live-copy">
          <span class="command-candidate-live-kicker">이번 턴 권고</span>
          <strong>${headline}</strong>
        </div>
        <span class="command-candidate-live-state">${stateLabel}</span>
      </div>
      <p class="command-candidate-live-route">${truncateBridgeLine(decisionLine, 148)}</p>
      ${renderCommandStrikeStrip(strikeCards, { tone, state: mode, context: 'candidate' })}
      <div class="command-candidate-live-focus">
        <span class="command-candidate-live-focus-label">${isDecision ? '현재 확정안' : isPreview ? '올라온 후보' : '우선 카드'}</span>
        <strong>${focusTitle}</strong>
        <small>${focusCopy}</small>
      </div>
      <div class="command-candidate-live-chips">
        ${chips.map(([label, value]) => `
          <span class="command-candidate-live-chip">
            <em>${label}</em>
            <strong>${value}</strong>
          </span>
        `).join('')}
      </div>
      <div class="command-candidate-live-commit">
        <strong>${commitTitle}</strong>
        <small>${commitCopy}</small>
      </div>
    </section>
  `;
}

function renderCommandSelectionStatus({
  mode = 'brief',
  sceneMeta = null,
  city = null,
  entry = null,
  tone = 'brief',
  actionsRemaining = 0,
  director = null,
  battlefieldDirector = null,
  recommendedSceneMeta = null,
} = {}) {
  const isDecision = mode === 'decision';
  const isPreview = mode === 'preview';
  const decisionLine = director?.status?.find?.(([label]) => label === '결정')?.[1]
    || director?.status?.find?.(([label]) => label === '권고')?.[1]
    || sceneMeta?.placeholderCopy
    || '카드를 고르면 결정 패널이 바로 실행 후보로 바뀝니다.';
  const mapReadout = battlefieldDirector?.mapReadout
    || battlefieldDirector?.sessionTrace?.mapReadout
    || director?.subhead
    || sceneMeta?.placeholderCopy
    || '지도 판독 대기';
  const laneHeadline = isDecision
    ? '이번 턴에 내릴 명령이 거의 정해졌습니다'
    : isPreview
      ? '후보를 확인하고 바로 확정할 수 있습니다'
      : '카드를 골라 이번 턴 명령을 정하십시오';
  const laneState = isDecision
    ? '확정 대기'
    : isPreview
      ? '후보 검토'
      : '선택 전';
  const candidateTitle = entry?.title || `${sceneMeta?.name || '명령'} 카드 선택 대기`;
  const candidateCopy = isDecision
    ? entry?.confirmText || entry?.decisionNote || entry?.detail || entry?.subtitle || entry?.effect || '이번 턴에 바로 반영할 선택입니다.'
    : isPreview
      ? entry?.detail || entry?.decisionNote || entry?.subtitle || entry?.effect || '후보가 올라왔습니다. Enter로 바로 확정할 수 있습니다.'
      : sceneMeta?.placeholderCopy || '현재 장면의 카드 한 장이 곧바로 결정 보드에 올라갑니다.';
  const sceneRoute = recommendedSceneMeta && recommendedSceneMeta.name !== sceneMeta?.name
    ? `현재 ${sceneMeta?.name || '명령'} · 권장 ${recommendedSceneMeta.name}`
    : `${sceneMeta?.name || '명령'} 장면에서 바로 결정`;
  const chips = entry
    ? [
      ['거점', city?.name || '도시 미선택'],
      ['비용', entry.cost || '행동력 1'],
      ['즉시 효과', truncateBridgeLine(entry.effect || entry.decisionNote || entry.subtitle || '이번 턴 판세에 즉시 반영', 42)],
    ]
    : [
      ['거점', city?.name || '도시 미선택'],
      ['장면', sceneMeta?.name || '명령'],
      ['행동력', `${actionsRemaining} 남음`],
    ];
  const selectionState = entry ? (isDecision ? 'armed' : 'active') : 'pending';
  const commitState = isDecision ? 'armed' : isPreview ? 'ready' : 'pending';
  const commitTitle = isDecision
    ? `${entry?.title || sceneMeta?.name || '명령'} 실행 준비`
    : isPreview
      ? `${entry?.title || sceneMeta?.name || '명령'} 확인 중`
      : '카드를 고르면 바로 실행 준비';
  const commitCopy = isDecision
    ? `${truncateBridgeLine(decisionLine, 96)} · Enter나 하단 결정 버튼으로 즉시 실행합니다.`
    : isPreview
      ? '후보를 다시 누르거나 Enter를 눌러 바로 확정합니다.'
      : '카드를 고르면 이 보드가 바로 이번 턴의 명령을 받습니다.';
  const commitPills = [
    `${actionsRemaining} AP`,
    isDecision ? 'Enter · 즉시 확정' : isPreview ? 'Enter · 후보 확정' : '카드 선택 필요',
    sceneRoute,
  ];
  const strikeCards = buildCommandStrikeCards({
    context: 'lane',
    mode,
    sceneMeta,
    city,
    entry,
    actionsRemaining,
    decisionLine,
    mapReadout,
    battlefieldDirector,
    recommendedSceneMeta,
    candidateTitle,
    candidateCopy,
    commitTitle,
    commitCopy,
  });

  return `
    <section class="command-decision-lane tone-${tone}" data-state="${mode}">
      <div class="command-decision-lane-head">
        <div class="command-decision-lane-heading">
          <span class="command-decision-lane-kicker">진행 순서</span>
          <strong>${laneHeadline}</strong>
        </div>
        <span class="command-decision-lane-state">${laneState}</span>
      </div>
      ${renderCommandStrikeStrip(strikeCards, { tone, state: mode, context: 'lane' })}
      <div class="command-decision-track">
        <article class="command-decision-step is-complete" data-step="readout">
          <span class="command-decision-step-index">01</span>
          <div class="command-decision-step-copy">
            <span class="command-decision-step-label">지도 판독</span>
            <strong>${truncateBridgeLine(mapReadout, 76)}</strong>
            <p>${truncateBridgeLine(decisionLine, 118)}</p>
          </div>
        </article>
        <article class="command-decision-step is-${selectionState}" data-step="selection">
          <span class="command-decision-step-index">02</span>
          <div class="command-decision-step-copy">
            <span class="command-decision-step-label">${entry ? '올라온 카드' : '실행 후보'}</span>
            <strong>${candidateTitle}</strong>
            <p>${candidateCopy}</p>
            <div class="selection-status-rail tone-${tone}">
              ${chips.map(([label, value]) => `
                <span class="selection-status-chip">
                  <em>${label}</em>
                  <strong>${value}</strong>
                </span>
              `).join('')}
            </div>
          </div>
        </article>
        <article class="command-decision-step is-${commitState}" data-step="commit">
          <span class="command-decision-step-index">03</span>
          <div class="command-decision-step-copy">
            <span class="command-decision-step-label">턴 확정</span>
            <strong>${commitTitle}</strong>
            <p>${commitCopy}</p>
            <div class="command-decision-commit-row">
              ${commitPills.map((pill) => `<span class="command-decision-commit-pill">${pill}</span>`).join('')}
            </div>
          </div>
        </article>
      </div>
    </section>
  `;
}

function truncateBridgeLine(text = '', max = 68) {
  const compact = `${text || ''}`.replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length > max ? `${compact.slice(0, Math.max(0, max - 1)).trim()}…` : compact;
}

function renderCommandBridgeSpine(steps = [], { layout = 'strip', density = 'compact' } = {}) {
  if (!steps.length) return '';
  const stripCount = Math.max(1, steps.length);
  return `
    <div class="battlefield-session-spine" data-layout="${layout}" data-density="${density}" style="--battlefield-session-strip-count:${stripCount}">
      ${steps.map((step, index) => `
        <article class="battlefield-session-step is-${step.status || 'pending'}">
          <span class="battlefield-session-step-index">${index + 1}</span>
          <div class="battlefield-session-step-copy">
            <span class="battlefield-session-step-label">${step.label}</span>
            <strong>${truncateBridgeLine(step.title || step.value || '', density === 'compact' ? 28 : 40)}</strong>
            <small>${truncateBridgeLine(step.detail || '', density === 'compact' ? 70 : 92)}</small>
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function renderCommandBridgeMetaStrip(items = []) {
  if (!items.length) return '';
  return `
    <div class="city-session-tactical-strip battlefield-session-meta-strip">
      ${items.slice(0, 3).map((item) => `
        <span class="city-session-tactical-chip tone-${item.tone || 'steady'}">
          <em>${item.label}</em>
          <strong>${item.value}</strong>
        </span>
      `).join('')}
    </div>
  `;
}

function renderCommandBridgeStory({
  city,
  sceneMeta,
  sceneId = null,
  recommendedScene = null,
  battlefieldDirector = null,
  cityBandLine = '',
  bridgeNote = '',
  mapReadoutLine = '',
  frontlineLine = '',
  nextActionLine = '',
}) {
  const recommendedMeta = COMMAND_SCENES[recommendedScene] || null;
  const aligned = !recommendedScene || recommendedScene === sceneId;
  const actionTitle = aligned
    ? sceneMeta?.name || '명령'
    : `권장 ${recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령'}`;
  const actionBadge = aligned
    ? '현재 권장 장면'
    : `권장 ${recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령'}`;
  const actionNote = aligned
    ? `${sceneMeta?.name || '명령'} 장면에서 실행 후보를 고르고 바로 확정합니다.`
    : `${sceneMeta?.name || '명령'} 장면을 보고 있지만 다음 행동은 ${recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령'} 쪽에 맞춰져 있습니다.`;

  return `
    <div class="command-bridge-story">
      <article class="battlefield-session-focus-card" data-slot="city">
        <div class="battlefield-session-focus-head">
          <div class="battlefield-session-focus-seal">${getFactionSealLabel(city.owner)}</div>
          <div class="battlefield-session-focus-copy">
            <span class="battlefield-session-focus-kicker">선택 도시</span>
            <strong>${city.name}</strong>
            <span class="battlefield-session-focus-subline">${truncateBridgeLine(cityBandLine, 88)}</span>
          </div>
        </div>
        <p class="battlefield-session-focus-note">${truncateBridgeLine(bridgeNote, 124)}</p>
        ${renderCommandBridgeMetaStrip(battlefieldDirector?.tags || [])}
      </article>
      <article class="battlefield-session-pivot-card" data-slot="map">
        <span class="battlefield-session-pivot-label">지도 판독</span>
        <strong>${truncateBridgeLine(mapReadoutLine, 60)}</strong>
        <small>${truncateBridgeLine(battlefieldDirector?.whyNow || frontlineLine || bridgeNote, 104)}</small>
        <div class="battlefield-session-inline-note battlefield-session-inline-note-subtle">${truncateBridgeLine(frontlineLine, 72)}</div>
      </article>
      <article class="battlefield-session-pivot-card battlefield-session-pivot-card-primary" data-slot="action">
        <span class="battlefield-session-pivot-label">다음 행동</span>
        <strong>${truncateBridgeLine(actionTitle, 44)}</strong>
        <small>${truncateBridgeLine(nextActionLine, 104)}</small>
        <div class="battlefield-session-inline-note battlefield-session-inline-note-subtle">${actionBadge}</div>
        <p class="battlefield-session-inline-note">${truncateBridgeLine(actionNote, 120)}</p>
      </article>
    </div>
  `;
}

function renderCommandBridgeDecisionTrack({
  city,
  sceneMeta,
  battlefieldDirector = null,
  recommendedScene = null,
  sceneId = null,
  mapReadoutLine = '',
  nextActionLine = '',
  frontlineLine = '',
}) {
  const recommendedMeta = COMMAND_SCENES[recommendedScene] || null;
  const actionDetail = recommendedScene && recommendedScene !== sceneId
    ? `${nextActionLine} · 권장 ${recommendedMeta?.name || recommendedScene}`
    : nextActionLine;
  const steps = [
    {
      label: '선택 도시',
      title: city.name,
      detail: battlefieldDirector?.objective || battlefieldDirector?.focus || city.name,
      status: 'complete',
    },
    {
      label: '지도 판독',
      title: mapReadoutLine,
      detail: battlefieldDirector?.whyNow || frontlineLine || mapReadoutLine,
      status: 'complete',
    },
    {
      label: '다음 행동',
      title: sceneMeta.name,
      detail: actionDetail,
      status: recommendedScene && recommendedScene !== sceneId ? 'recommended' : 'complete',
    },
    {
      label: '턴 확정',
      title: recommendedScene === sceneId ? '패널에서 바로 확정' : `권장 ${recommendedMeta?.name || recommendedScene || sceneMeta.name}`,
      detail: recommendedScene === sceneId
        ? `${sceneMeta.name} 장면에서 카드를 고르고 곧바로 확정할 수 있습니다.`
        : `현재는 ${sceneMeta.name} 장면입니다. 필요하면 권장 장면으로 옮겨 흐름을 맞춥니다.`,
      status: 'active',
    },
  ];

  return renderCommandBridgeSpine(steps, { layout: 'strip', density: 'compact' });
}

function renderCommandBridgeRouteDeck({
  city,
  sceneMeta,
  sceneId,
  recommendedScene = null,
  battlefieldDirector = null,
  mapReadoutLine = '',
  nextActionLine = '',
  frontlineLine = '',
  bridgeNote = '',
}) {
  const recommendedMeta = COMMAND_SCENES[recommendedScene] || null;
  const aligned = !recommendedScene || recommendedScene === sceneId;
  const route = [
    {
      label: '거점',
      value: city?.name || '도시 미선택',
      state: 'active',
    },
    {
      label: '판독',
      value: mapReadoutLine || '지도 판독 대기',
      state: 'active',
    },
    {
      label: '장면',
      value: aligned ? sceneMeta?.name || '명령' : recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령',
      state: aligned ? 'ready' : 'pending',
    },
    {
      label: '확정',
      value: aligned ? '현재 패널에서 확정' : '권장 장면 전환',
      state: aligned ? 'armed' : 'pending',
    },
  ];
  const focusTitle = aligned
    ? `${sceneMeta?.name || '명령'}에서 턴 결정을 바로 고정합니다`
    : `${recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령'}로 옮겨 같은 결정 축을 유지합니다`;
  const focusCopy = aligned
    ? `${sceneMeta?.name || '명령'} 카드 한 장이 곧바로 턴 결정으로 이어집니다.`
    : `${sceneMeta?.name || '명령'}을 보고 있지만 권장 축은 ${recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령'}입니다.`;
  const deckNote = aligned
    ? nextActionLine || bridgeNote || '현재 장면에서 바로 이번 턴 결정을 밀어 올릴 수 있습니다.'
    : bridgeNote || nextActionLine || '장면만 맞춰 주면 다음 행동 흐름이 다시 같은 축으로 맞춰집니다.';
  const meta = [
    frontlineLine || '전선 판독 대기',
    battlefieldDirector?.objective || bridgeNote || '선택 도시 허브',
    aligned ? '현재 권장 장면' : `권장 ${recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령'}`,
  ];

  return `
    <aside class="battlefield-decision-deck battlefield-decision-deck-bridge" data-context="bridge" data-state="${aligned ? 'selection' : 'overview'}" data-tone="${aligned ? 'aligned' : '전환'}">
      <div class="battlefield-decision-deck-head">
        <div class="battlefield-decision-deck-copy">
          <span class="battlefield-decision-deck-kicker">${aligned ? '다음 행동' : '장면 전환'}</span>
          <strong>${truncateBridgeLine(focusTitle, 62)}</strong>
          <small>${truncateBridgeLine(focusCopy, 128)}</small>
        </div>
        <span class="battlefield-decision-deck-state">${aligned ? '바로 확정' : '전환 필요'}</span>
      </div>
      <div class="battlefield-decision-route">
        ${route.map((entry) => `
          <article class="battlefield-decision-route-step is-${entry.state}">
            <em>${entry.label}</em>
            <strong>${truncateBridgeLine(entry.value, 28)}</strong>
          </article>
        `).join('')}
      </div>
      <div class="battlefield-decision-focus">
        <span class="battlefield-decision-focus-label">${aligned ? '현재 결정 축' : '다음 장면 보정'}</span>
        <strong>${truncateBridgeLine(aligned ? `${city?.name || '도시'} · ${sceneMeta?.name || '명령'}` : `${city?.name || '도시'} · ${recommendedMeta?.name || recommendedScene || sceneMeta?.name || '명령'}`, 56)}</strong>
        <p>${truncateBridgeLine(deckNote, 148)}</p>
      </div>
      <div class="battlefield-decision-meta">
        ${meta.map((entry) => `<span class="battlefield-decision-meta-chip">${truncateBridgeLine(entry, 32)}</span>`).join('')}
      </div>
    </aside>
  `;
}

function renderCommandBridge({ city, sceneId, director = null, battlefieldDirector = null, recommendedScene = null }) {
  const sceneMeta = COMMAND_SCENES[sceneId] || { name: sceneId || '명령', kicker: 'command' };
  const recommendedMeta = COMMAND_SCENES[recommendedScene] || null;
  const frontlineLine = director?.status?.find?.(([label]) => label === '전선')?.[1]
    || battlefieldDirector?.risk
    || '전선 판독 대기';
  const mapReadoutLine = battlefieldDirector?.mapReadout
    || battlefieldDirector?.sessionTrace?.mapReadout
    || frontlineLine;
  const nextActionLine = director?.status?.find?.(([label]) => label === '권고')?.[1]
    || battlefieldDirector?.action
    || sceneMeta.placeholderCopy
    || '이번 턴의 명령을 정하십시오.';
  const bridgeNote = battlefieldDirector?.objective
    || battlefieldDirector?.whyNow
    || director?.subhead
    || sceneMeta.placeholderCopy
    || '';
  const cityBandLine = battlefieldDirector?.objective
    || director?.headline
    || director?.subhead
    || city.name;
  const sessionBadge = recommendedScene === sceneId ? '현재 권장 장면' : `권장 ${recommendedMeta?.name || recommendedScene || sceneMeta.name}`;

  return `
    <section class="command-bridge-panel" data-scene="${sceneId}">
      <div class="command-bridge-head">
        <div class="command-bridge-heading">
          <span class="command-bridge-kicker">전장 판단</span>
          <strong class="command-bridge-title">${city.name} · ${sceneMeta.name}</strong>
        </div>
        <span class="command-bridge-badge">${sessionBadge}</span>
      </div>
      <div class="command-bridge-grid">
        <div class="command-bridge-main">
          <div class="command-bridge-status">
            <div class="command-bridge-status-copy">
              <span class="command-bridge-status-label">이번 턴 흐름</span>
              <strong>${truncateBridgeLine(nextActionLine, 88)}</strong>
            </div>
          </div>
          ${renderCommandBridgeStory({
            city,
            sceneMeta,
            sceneId,
            recommendedScene,
            battlefieldDirector,
            cityBandLine,
            bridgeNote,
            mapReadoutLine,
            frontlineLine,
            nextActionLine,
          })}
          ${renderCommandBridgeDecisionTrack({
            city,
            sceneMeta,
            battlefieldDirector,
            recommendedScene,
            sceneId,
            mapReadoutLine,
            nextActionLine,
            frontlineLine,
          })}
        </div>
        ${renderCommandBridgeRouteDeck({
          city,
          sceneMeta,
          sceneId,
          recommendedScene,
          battlefieldDirector,
          mapReadoutLine,
          nextActionLine,
          frontlineLine,
          bridgeNote,
        })}
      </div>
    </section>
  `;
}

function renderScenePlaceholder(sceneMeta, sceneId = null, cityId = null, state = null, connections = []) {
  if (!sceneId || !cityId || !state?.cities?.[cityId]) {
    return `
      <div class="command-preview-empty scene-${sceneId || 'neutral'}">
        <div class="command-preview-kicker">${sceneMeta.kicker}</div>
        <h3>${sceneMeta.placeholderTitle}</h3>
        <p>${sceneMeta.placeholderCopy}</p>
      </div>
    `;
  }

  const city = { id: cityId, ...state.cities[cityId] };
  const faction = state.getFaction(state.player.factionId);
  const forecast = getCityForecast(cityId, state);
  const director = buildCommandDirectorPacket({ cityId, sceneId, state, connections });
  const digest = buildSceneDigest(sceneId, city, state, faction, forecast, connections);
  const sceneBadges = {
    government: '장부 브리프',
    military: '전황판',
    diplomacy: '교섭 기록',
    personnel: '인사 명부',
  };
  return `
    <div class="command-preview-empty command-preview-digest scene-${sceneId}">
      <div class="command-preview-kicker">${sceneBadges[sceneId] || sceneMeta.kicker}</div>
      <h3>${director.headline || digest.title || sceneMeta.placeholderTitle}</h3>
      <p>${director.subhead || digest.copy || sceneMeta.placeholderCopy}</p>
      <div class="preview-digest-grid">
        ${(digest.stats || []).map((item) => `
          <div class="preview-digest-card">
            <span class="preview-digest-label">${item.label}</span>
            <strong class="preview-digest-value">${item.value}</strong>
          </div>
        `).join('')}
      </div>
      <ul class="preview-digest-notes">
        ${(digest.notes || []).filter(Boolean).map((line) => `<li>${line}</li>`).join('')}
      </ul>
    </div>
  `;
}

function renderCommandSheetPreview({
  mode = 'brief',
  sceneMeta = null,
  sceneId = null,
  cityId = null,
  state = null,
  connections = [],
  entry = null,
} = {}) {
  const tone = entry ? getCommandPreviewTone(entry) : sceneId || 'neutral';
  const previewKicker = mode === 'decision'
    ? '결과 미리보기'
    : mode === 'preview'
      ? '후보 판독'
      : '장면 판독';
  const previewTitle = mode === 'decision'
    ? '확정 직전 파급과 세부'
    : mode === 'preview'
      ? '후보가 올라온 이유와 즉시 파급'
      : `${sceneMeta?.name || '명령'} 장면에서 먼저 읽을 축`;
  const previewBadge = mode === 'decision'
    ? '즉시 실행'
    : mode === 'preview'
      ? '후보'
      : '판독';
  const content = entry
    ? renderPendingPreview(entry)
    : renderScenePlaceholder(sceneMeta, sceneId, cityId, state, connections);

  return `
    <section class="command-sheet-preview-panel tone-${tone}" data-state="${mode}">
      <div class="command-sheet-preview-head">
        <div class="command-sheet-preview-copy">
          <span class="command-sheet-preview-kicker">${previewKicker}</span>
          <strong>${previewTitle}</strong>
        </div>
        <span class="command-sheet-preview-badge">${previewBadge}</span>
      </div>
      <div class="command-sheet-preview-body">
        ${content}
      </div>
    </section>
  `;
}

function renderPendingPreview(entry) {
  const tone = getCommandPreviewTone(entry);
  const kicker = {
    government: '시정 결정안',
    military: '군령 발령안',
    diplomacy: '교섭 제안서',
    personnel: '인사 조치안',
    neutral: entry.priorityLabel ? `${entry.priorityLabel} 명령` : '선택된 명령',
  }[tone] || (entry.priorityLabel ? `${entry.priorityLabel} 명령` : '선택된 명령');
  return `
    <div class="command-preview-card tone-${tone}">
      <div class="command-preview-kicker">${kicker}</div>
      <h3>${entry.preview.title || entry.title}</h3>
      <ul class="command-preview-lines">
        ${(entry.preview.lines || []).map((line) => `<li>${line}</li>`).join('')}
      </ul>
      ${entry.decisionNote ? `<div class="command-preview-effect">판단 포인트: ${entry.decisionNote}</div>` : ''}
      ${entry.effect ? `<div class="command-preview-effect">효과: ${entry.effect}</div>` : ''}
      ${entry.cost ? `<div class="command-preview-cost">${entry.cost}</div>` : ''}
    </div>
  `;
}

function formatConfirmActionLabel(label = '') {
  const compact = label.replace(/\s+/g, ' ').trim();
  if (!compact) return '명령';
  return compact.length > 8 ? `${compact.slice(0, 8).trim()}...` : compact;
}

function renderFooterButtonLabel(label, hotkey) {
  return `<span>${label}</span><kbd>${hotkey}</kbd>`;
}

function getCommandPreviewTone(entry) {
  const actionType = entry?.actionType || '';
  if (actionType.startsWith('invest_') || ['build', 'start_research', 'trade_food', 'transport_food'].includes(actionType)) return 'government';
  if (['attack', 'declare_war', 'move_troops', 'conscript', 'recruit'].includes(actionType)) return 'military';
  if (['propose_peace', 'propose_alliance', 'propose_marriage', 'send_tribute', 'threaten', 'espionage'].includes(actionType)) return 'diplomacy';
  if (['search_talent', 'persuade_captive', 'release_captive', 'reward_officer', 'bestow_item', 'confiscate_item', 'dismiss_officer', 'appoint_tactician', 'move_general', 'appoint_governor'].includes(actionType)) return 'personnel';
  return 'neutral';
}

function createCommandKey(entry) {
  return [
    entry.actionType,
    entry.params?.cityId,
    entry.params?.fromCity,
    entry.params?.toCity,
    entry.params?.targetFaction,
    entry.params?.buildingId,
    entry.params?.techId,
    entry.params?.captiveId,
    entry.params?.charId,
    entry.params?.slot,
    entry.params?.policyType,
    entry.params?.value,
    entry.params?.mode,
    entry.params?.amount,
    entry.params?.actionType,
  ].filter(Boolean).join(':');
}

function createSectionKey(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatSectionCount(enabledCount, totalCount) {
  if (!totalCount) return '0개';
  return enabledCount === totalCount ? `${totalCount}개` : `${enabledCount}/${totalCount}`;
}

function buildSceneDigest(sceneId, city, state, faction, forecast, connections = []) {
  const tactician = state.getTactician?.(state.player.factionId);
  const doctrine = getFactionDoctrine(state?.player?.factionId);
  const sceneDoctrine = doctrine?.command?.[sceneId] || doctrine?.command?.government || null;
  if (sceneId === 'government') {
    const policy = getCityPolicy(city);
    const research = getResearchStatus(state, state.player.factionId);
    const activeBuilds = Object.values(city.buildings || {}).filter((building) => building?.building).length;
    const buyPreview = previewFoodTrade(state, city.id, city.food < 9000 ? 3000 : 2000, 'buy');
    return {
      title: `${city.name} ${sceneDoctrine?.boardTitle || '시정 브리핑'}`,
      copy: joinCopyParts(
        sceneDoctrine?.digestLead,
        '지금 명령을 고르지 않아도, 이 도시가 어디에서 이득을 보고 어디가 흔들리는지, 그리고 교역으로 무엇을 메울지부터 읽을 수 있어야 합니다.'
      ),
      stats: [
        { label: '태수', value: city.governor ? getCharName(city.governor) : '공석' },
        { label: '시정', value: policy.domestic.name },
        { label: '월간 금', value: signed(forecast.goldDelta) },
        { label: '공사', value: activeBuilds ? `${activeBuilds}건` : '없음' },
        { label: '교역', value: seasonLabel(buyPreview.season || getTradeSeason(state.month)) },
        { label: '연구', value: research.researching ? `${research.name} ${research.turnsLeft}턴` : '대기' },
      ],
      notes: [
        `${policy.domestic.name}: ${policy.domestic.bonus}`,
        sceneDoctrine?.noteLead || '이번 시정은 도시의 장기 리듬을 바꾸는 판단입니다.',
        tactician ? `${getCharName(tactician.id)}: ${buildAdvisorOneLiner('government', city.id, state)}` : '책사를 임명하면 시정 브리핑의 방향성이 선명해집니다.',
        forecast.recommendations[0] || '이번 턴에는 성장축 하나를 확실히 밀어주는 편이 좋습니다.',
        forecast.bonuses[0] || '건설과 연구는 다음 몇 턴의 질감을 바꾸는 장기 선택입니다.',
        buyPreview.allowed ? `군량 ${buyPreview.amount.toLocaleString()} 매입 시 금 ${buyPreview.gold.toLocaleString()}이 듭니다.` : tradeReasonLabel(buyPreview.reason),
        forecast.risks[0] || '즉시 터질 위험은 크지 않습니다.',
      ],
    };
  }

  if (sceneId === 'military') {
    const policy = getCityPolicy(city);
    const enemyNeighbors = getNeighborCitiesByRelation(city.id, state, state.player.factionId, connections, 'enemy');
    const friendlyNeighbors = getNeighborCitiesByRelation(city.id, state, state.player.factionId, connections, 'friendly');
    const supplyTargets = friendlyNeighbors.filter((neighbor) => getSuggestedFoodTransport(city, neighbor, enemyNeighbors.length > 0).amount > 0);
    const conscriptPreview = previewConscript(city.id, state, city.governor || state.getFaction(state.player.factionId)?.leader);
    return {
      title: `${city.name} ${sceneDoctrine?.boardTitle || '전황 보드'}`,
      copy: joinCopyParts(
        sceneDoctrine?.digestLead,
        '출정과 병력 이동은 같은 버튼 문법이 아니라 같은 전선 보드 안에서 읽혀야 합니다.'
      ),
      stats: [
        { label: '병력', value: formatNumber(city.army) },
        { label: '방어', value: formatNumber(asNumber(city.defense)) },
        { label: '적 접경', value: `${enemyNeighbors.length}곳` },
        { label: '보급선', value: `${supplyTargets.length}곳` },
        { label: '군령', value: policy.military.name },
        { label: '징병', value: conscriptPreview.allowed ? `${formatNumber(conscriptPreview.recruits)}명` : '보류' },
      ],
      notes: [
        `${policy.military.name}: ${policy.military.bonus}`,
        sceneDoctrine?.noteLead || '이번 군령은 병력과 보급을 함께 보는 판단입니다.',
        tactician ? `${getCharName(tactician.id)}: ${buildAdvisorOneLiner('military', city.id, state)}` : '책사를 임명하면 군령 장면의 조언이 강화됩니다.',
        enemyNeighbors.length > 0 ? `즉시 눌러볼 수 있는 적 접경 도시 ${enemyNeighbors.length}곳` : '즉시 침공보다 병력 집결이 먼저인 판입니다.',
        supplyTargets[0] ? `${supplyTargets[0].name} 방향으로 군량 수송 카드를 바로 열 수 있습니다.` : (friendlyNeighbors.length > 0 ? `${friendlyNeighbors[0].name} 방향으로 보강 루트가 열려 있습니다.` : '병력 재배치는 제한적입니다.'),
        conscriptPreview.allowed ? `징병 시 치안 -${conscriptPreview.orderLoss}, 인구 -${formatNumber(conscriptPreview.populationLoss)}` : `${terrainLabel(city.terrain?.type || city.terrain)} 거점이라 방어 투자 가치가 있습니다.`,
      ],
    };
  }

  if (sceneId === 'diplomacy') {
    const targetOwner = city.owner && city.owner !== state.player.factionId ? state.factions[city.owner] : null;
    return {
      title: targetOwner ? `${targetOwner.name} ${sceneDoctrine?.boardTitle || '외교 브리핑'}` : `천하 ${sceneDoctrine?.boardTitle || '외교 브리핑'}`,
      copy: joinCopyParts(
        sceneDoctrine?.digestLead,
        '강화, 동맹, 위협, 첩보는 같은 외교 장부 안에서 성공률과 후폭풍을 함께 읽게 해야 합니다.'
      ),
      stats: [
        { label: '평판', value: formatNumber(faction.reputation || 100) },
        { label: '전쟁', value: `${(faction.enemies || []).length}곳` },
        { label: '동맹', value: `${(faction.allies || []).length}곳` },
        { label: '책사', value: tactician ? getCharName(tactician.id) : (targetOwner ? targetOwner.name : '복수 세력') },
      ],
      notes: [
        sceneDoctrine?.noteLead || '이번 외교는 다음 전선을 바꾸는 장기 판단입니다.',
        tactician ? `${getCharName(tactician.id)}: ${buildAdvisorOneLiner('diplomacy', city.id, state)}` : '책사를 임명하면 외교 장면의 조언과 판정이 강화됩니다.',
        targetOwner ? `현재 ${targetOwner.name}과 ${state.isAtWar(state.player.factionId, targetOwner.id) ? '전쟁 중' : '직접 전쟁은 아님'}` : '도시를 바꾸면 외교 대상과 첩보 대상도 바뀝니다.',
        `총병력 ${formatNumber(state.getTotalArmy(state.player.factionId))} 기준으로 외교 압박이 계산됩니다.`,
        '첩보는 다음 전선을 미리 여는 준비 명령으로 봐야 합니다.',
      ],
    };
  }

  const myChars = state.getCharactersInCity(city.id).filter((char) => char.faction === state.player.factionId);
  const captives = state.getCaptivesOfFaction(state.player.factionId).filter((char) => char.city === city.id);
  const wanderers = state.getWanderingInCity(city.id);
  const lowLoyalty = [...myChars].filter((char) => char.id !== faction?.leader).sort((a, b) => (a.loyalty ?? 50) - (b.loyalty ?? 50))[0];
  const confiscationTargets = [...myChars]
    .filter((char) => char.equipment && Object.values(char.equipment).some(Boolean) && char.id !== faction?.leader)
    .sort((a, b) => totalEquippedRarityScore(b) - totalEquippedRarityScore(a));
  return {
    title: `${city.name} ${sceneDoctrine?.boardTitle || '인재 장부'}`,
    copy: joinCopyParts(
      sceneDoctrine?.digestLead,
      '장수 수, 포로, 방랑 인재, 태수 상태를 먼저 보여줘야 인사가 게임처럼 읽힙니다.'
    ),
    stats: [
      { label: '태수', value: city.governor ? getCharName(city.governor) : '공석' },
      { label: '장수', value: `${myChars.length}명` },
      { label: '포로', value: `${captives.length}명` },
      { label: '책사', value: tactician ? getCharName(tactician.id) : '없음' },
    ],
      notes: [
        sceneDoctrine?.noteLead || '이번 인사는 도시 역할을 분리하는 판단입니다.',
        tactician ? `${getCharName(tactician.id)}: ${buildAdvisorOneLiner('personnel', city.id, state)}` : '책사를 임명하면 인사 장면의 장부가 더 분명해집니다.',
        myChars.length > 0 ? `도시 장수층을 재배치하면 전선 도시와 후방 도시 역할이 또렷해집니다.` : '현재 이 도시에 배치된 장수가 적어, 다른 도시 장수를 불러오는 편이 낫습니다.',
        lowLoyalty ? `${getCharName(lowLoyalty.id)}의 충성 ${Math.round(lowLoyalty.loyalty ?? 50)}은 포상 대상입니다.` : (wanderers.length > 0 ? `${wanderers.length}명의 방랑 인재가 감지됩니다.` : '탐색보다 내부 재배치에 집중할 수 있습니다.'),
        confiscationTargets[0] ? `${getCharName(confiscationTargets[0].id)}의 하사품을 회수해 재배치할 수 있습니다.` : '회수할 하사품은 많지 않습니다.',
        lowLoyalty && wanderers.length > 0
          ? `${wanderers.length}명의 방랑 인재가 감지됩니다.`
          : (captives.length > 0 ? `설득 가능한 포로 ${captives.length}명 보유` : `이동 가능한 타도시 ${state.getCitiesOfFaction(state.player.factionId).filter((targetCity) => targetCity.id !== city.id).length}곳`),
      ],
  };
}

function getNeighborCitiesByRelation(cityId, state, playerFactionId, connections, relation) {
  const result = [];
  for (const [a, b] of connections || []) {
    const neighborId = a === cityId ? b : b === cityId ? a : null;
    if (!neighborId) continue;
    const neighbor = state.cities[neighborId];
    if (!neighbor?.owner) continue;
    if (relation === 'enemy' && neighbor.owner !== playerFactionId && state.isAtWar(playerFactionId, neighbor.owner)) {
      result.push({ id: neighborId, ...neighbor });
    }
    if (relation === 'friendly' && neighbor.owner === playerFactionId) {
      result.push({ id: neighborId, ...neighbor });
    }
  }
  return result;
}

function getSuggestedFoodTransport(fromCity, toCity, frontlinePressure = false) {
  const shortage = Math.max(0, 9000 - asNumber(toCity.food));
  const sourceSurplus = Math.max(0, asNumber(fromCity.food) - (frontlinePressure ? 5500 : 4000));
  const amount = Math.min(
    frontlinePressure ? 7000 : 5000,
    Math.max(0, Math.ceil(Math.max(shortage, sourceSurplus * 0.45) / 500) * 500),
    sourceSurplus
  );

  if (amount <= 0) {
    return { amount: 0, reason: '당장 긴급 수송 필요 없음' };
  }

  if (toCity.food < 5000) {
    return { amount, reason: '식량 부족 전선 보강' };
  }
  if (frontlinePressure) {
    return { amount, reason: '접경선 대비 비축' };
  }
  return { amount, reason: '후방 비축 조정' };
}

function buildAdvisorOneLiner(sceneId, cityId, state) {
  const city = state.cities[cityId];
  if (!city) return '도시 데이터가 없습니다.';
  const policy = getCityPolicy(city);

  if (sceneId === 'government') {
    const forecast = getCityForecast(cityId, state);
    if (forecast.risks.includes('식량난')) return '먼저 군량을 매입해 다음 달 결산을 버틸 여지를 만드십시오.';
    if (policy.domesticFocus !== 'balanced') return `${policy.domestic.name} 기조를 살리되, 교역으로 빈칸을 메워야 합니다.`;
    return forecast.recommendations[0] || '성장축 하나를 선명하게 밀고, 교역으로 빈칸을 메워야 합니다.';
  }

  if (sceneId === 'military') {
    const currentCity = state.cities[cityId];
    const conscriptPreview = previewConscript(cityId, state, currentCity.governor || state.getFaction(state.player.factionId)?.leader);
    const enemyPressure = Object.values(state.cities).some((otherCity) => otherCity.owner && otherCity.owner !== state.player.factionId && state.isAtWar(state.player.factionId, otherCity.owner));
    if (policy.militaryPosture === 'fortify') return '수비 우선 기조라면 침공보다 성방과 집결을 먼저 보십시오.';
    if (policy.militaryPosture === 'mobilize' && conscriptPreview.allowed) return '동원 우선 기조이니 징병과 병참을 먼저 굴리는 편이 낫습니다.';
    if (enemyPressure && conscriptPreview.allowed && currentCity.army < 12000) return '즉시 침공보다 징병과 병참 정리로 전선을 두껍게 만드는 편이 낫습니다.';
    if (enemyPressure && currentCity.army < 12000) return '무리한 침공보다 병력 집결과 병참 정리가 먼저입니다.';
    return '직접 침공보다 접경 개방과 보강 루트를 먼저 확인하십시오.';
  }

  if (sceneId === 'diplomacy') {
    const wars = state.getFaction(state.player.factionId)?.enemies?.length || 0;
    if (wars >= 2) return '외교는 전선을 줄이는 카드로 써야 합니다.';
    return '강화와 첩보를 같은 턴에 엮어 다음 전선을 준비하십시오.';
  }

  const chars = state.getCharactersInCity(cityId).filter((char) => char.faction === state.player.factionId);
  const lowLoyalty = chars.filter((char) => char.id !== state.getFaction(state.player.factionId)?.leader)
    .sort((a, b) => (a.loyalty ?? 50) - (b.loyalty ?? 50))[0];
  if (lowLoyalty) return `${getCharName(lowLoyalty.id)}의 충성을 먼저 다잡는 편이 좋습니다.`;
  if (chars.some((char) => char.equipment && Object.values(char.equipment).some(Boolean))) return '하사품 회수와 재배치까지 포함해 인재층을 정리할 수 있습니다.';
  return '탐색보다 장수 이동과 태수·책사 배치부터 정리할 수 있습니다.';
}

function buildBattleTeaser(state, fromCityId, toCityId) {
  const from = state.cities[fromCityId];
  const to = state.cities[toCityId];
  if (!from || !to) return '전황 데이터를 불러올 수 없습니다.';
  const attackArmy = Math.floor(from.army * 0.6);
  const ratio = attackArmy / Math.max(1, to.army);
  if (ratio >= 1.3) return '우세 병력으로 밀어붙이는 전투입니다.';
  if (ratio >= 0.9) return '거의 대등한 전투입니다.';
  return '병력 열세라 전술과 사기가 중요합니다.';
}

function buildBattleLines(state, fromCityId, toCityId) {
  const from = state.cities[fromCityId];
  const to = state.cities[toCityId];
  const terrain = state.getConnectionTerrain(fromCityId, toCityId);
  const attackArmy = Math.floor(from.army * 0.6);
  const ratio = attackArmy / Math.max(1, to.army);
  const attackerGenerals = state.getCharactersInCity(fromCityId).filter((char) => char.faction === state.player.factionId);
  const defenderGenerals = state.getCharactersInCity(toCityId).filter((char) => char.faction === to.owner);
  const atkFormation = chooseFormation(attackerGenerals, terrain, true, ratio);
  const defFormation = chooseFormation(defenderGenerals, terrain, false, 1 / Math.max(0.2, ratio));
  return [
    `아군 예상 투입 ${attackArmy.toLocaleString()}명 · 적 병력 ${to.army.toLocaleString()}명`,
    `${terrainLabel(terrain)} 전투 · 추천 진형 ${atkFormation} vs ${defFormation}`,
    ratio >= 1.3 ? '병력 우세입니다.' : ratio >= 0.9 ? '접전 예상입니다.' : '병력 열세입니다.',
  ];
}

function terrainLabel(terrain) {
  return {
    plains: '평지',
    river: '강',
    mountain: '산',
    forest: '숲',
    wetland: '습지',
  }[terrain] || '지형 불명';
}

function trackName(track) {
  return {
    agriculture: '농업',
    commerce: '상업',
    technology: '기술',
    publicOrder: '치안',
  }[track] || '성장축';
}

function officerLedgerPriority(char, city, faction, currentTactician) {
  let score = totalStats(char.stats);
  if (char.id === city.governor) score += 120;
  if (char.id === faction.leader) score += 160;
  if (char.id === currentTactician?.id) score += 110;
  if ((char.loyalty ?? 50) < 60) score += 30;
  if (Object.values(char.equipment || {}).some(Boolean)) score += 20;
  return score;
}

function getOfficerRoleBadges(char, city, faction, currentTactician) {
  const badges = [];
  if (char.id === faction.leader) badges.push({ text: '군주', tone: 'leader' });
  if (char.id === city.governor) badges.push({ text: '태수', tone: 'governor' });
  if (char.id === currentTactician?.id) badges.push({ text: '책사', tone: 'advisor' });
  if ((char.loyalty ?? 50) < 60) badges.push({ text: '불안', tone: 'warning' });
  if (Object.values(char.equipment || {}).some(Boolean)) badges.push({ text: '하사품', tone: 'item' });
  return badges;
}

function totalStats(stats) {
  return Object.values(stats || {}).reduce((sum, value) => sum + value, 0);
}

function totalEquippedRarityScore(char) {
  const rarityScore = { legendary: 3, rare: 2, common: 1 };
  return Object.values(char?.equipment || {}).reduce((sum, itemId) => {
    if (!itemId) return sum;
    const item = ITEMS[itemId];
    return sum + (rarityScore[item?.rarity] || 1);
  }, 0);
}

export function executePlayerAction(actionType, params, state, connections = null) {
  const faction = state.getFaction(state.player.factionId);
  if (!faction || state.actionsRemaining <= 0) return false;
  state.lastPlayerActionResult = null;
  const defaultFocusCityId = params?.toCity || params?.cityId || params?.targetCityId || params?.fromCity || null;

  const recordResult = ({ title, body, tone = 'neutral', kicker, focusCityId = defaultFocusCityId }) => {
    state.lastPlayerActionResult = { title, body, tone, kicker, focusCityId, actionType };
    return true;
  };

  switch (actionType) {
    case 'invest_agriculture':
    case 'invest_commerce':
    case 'invest_technology':
    case 'invest_publicOrder': {
      const track = actionType.replace('invest_', '');
      const result = investTrack(params.cityId, track, state, params.governorId);
      if (!result.success) return false;
      const names = { agriculture: '농업', commerce: '상업', technology: '기술', publicOrder: '치안' };
      state.actionsRemaining--;
      state.log(`${state.cities[params.cityId].name}에 ${names[track]} 투자 (+${result.gain})`, 'player');
      return recordResult({
        tone: 'growth',
        title: `${names[track]} 투자를 집행했습니다`,
        body: `${state.cities[params.cityId].name}의 ${names[track]} 수치가 +${result.gain} 상승했습니다.`,
      });
    }

    case 'invest_defense': {
      const city = state.cities[params.cityId];
      if (!city || faction.gold < 500) return false;
      faction.gold -= 500;
      city.defense = Math.min(100, asNumber(city.defense) + 5);
      state.actionsRemaining--;
      state.log(`${city.name}에 방어 강화 (방어 +5)`, 'player');
      return recordResult({
        tone: 'fortify',
        title: `${city.name} 성방을 보강했습니다`,
        body: `방어 수치가 ${city.defense}까지 올라 전선 유지력이 조금 더 단단해졌습니다.`,
      });
    }

    case 'recruit':
    case 'conscript': {
      const result = conscriptTroops(params.cityId, state, params.governorId || null);
      if (!result.success) return false;
      state.actionsRemaining--;
      state.log(
        `${state.cities[params.cityId].name}에서 ${result.recruits.toLocaleString()}명 징병 (치안 -${result.orderLoss}, 군량 -${result.foodCost.toLocaleString()})`,
        'player'
      );
      return recordResult({
        tone: 'military',
        title: `${result.recruits.toLocaleString()}명을 징병했습니다`,
        body: `${state.cities[params.cityId].name} 전선에 즉시 투입할 병력이 늘었습니다.`,
      });
    }

    case 'attack': {
      const from = state.cities[params.fromCity];
      const to = state.cities[params.toCity];
      if (!from || !to || from.army < 3000) return false;

      const attackArmy = Math.floor(from.army * 0.6);
      from.army -= attackArmy;

      const atkGenerals = state.getCharactersInCity(params.fromCity)
        .filter((char) => char.faction === state.player.factionId)
        .sort((a, b) => b.stats.command - a.stats.command);
      const defGenerals = state.getCharactersInCity(params.toCity)
        .filter((char) => char.faction === to.owner)
        .sort((a, b) => b.stats.command - a.stats.command);

      const terrain = state.getConnectionTerrain(params.fromCity, params.toCity);
      const armyRatio = attackArmy / Math.max(1, to.army);
      const atkFormation = chooseFormation(atkGenerals, terrain, true, armyRatio);
      const defFormation = chooseFormation(defGenerals, terrain, false, 1 / armyRatio);

      const result = resolveEnhancedCombat(
        { army: attackArmy, morale: from.morale, generals: atkGenerals, formation: atkFormation, factionId: state.player.factionId },
        { army: to.army, morale: to.morale, defense: asNumber(to.defense), generals: defGenerals, formation: defFormation, factionId: to.owner },
        { terrain },
        state
      );

      to.army = result.defenderRemaining;
      const survivors = result.attackerRemaining;
      for (const general of atkGenerals) addExperienceFromSource(state, general.id, 'battle_participation');
      for (const general of defGenerals) addExperienceFromSource(state, general.id, 'battle_participation');

      if (result.winner === 'attacker') {
        const defCharIds = defGenerals.map((general) => general.id);
        const captured = attemptCapture(defCharIds, state.player.factionId, state);
        const oldOwner = to.owner;

        to.owner = state.player.factionId;
        to.army = survivors;
        to.morale = Math.max(20, result.attackerMorale);
        state.recordSummary('citiesCaptured', {
          cityId: params.toCity,
          cityName: to.name,
          fromFaction: oldOwner,
          toFaction: state.player.factionId,
        });
        for (const general of atkGenerals) addExperienceFromSource(state, general.id, 'battle_victory');

        let message = `${to.name} 점령! (${result.rounds}라운드, ${result.formations.attacker} vs ${result.formations.defender})`;
        if (result.stratagemUsed?.success) message += ` [${result.stratagemUsed.name}]`;
        if (captured.length > 0) message += ` (포로 ${captured.length}명)`;
        state.log(message, 'territory');
        state.actionsRemaining--;
      return recordResult({
        tone: 'victory',
        title: `${to.name}을(를) 점령했습니다`,
        body: `${result.rounds}라운드 끝에 ${to.name}의 깃발이 꺾였습니다.${captured.length > 0 ? ` 포로 ${captured.length}명도 확보해 전후 정리까지 앞섰습니다.` : ' 지금이 바로 다음 전선을 물어뜯을 타이밍입니다.'}`,
      });
      } else {
        from.army += survivors;
        let message = `${to.name} 공격 실패 (아군 -${result.attackerLoss}, 적 -${result.defenderLoss})`;
        if (result.stratagemUsed) message += ` [${result.stratagemUsed.name} ${result.stratagemUsed.success ? '성공' : '실패'}]`;
        state.log(message, 'war');
        state.actionsRemaining--;
        return recordResult({
          tone: 'warning',
          title: `${to.name} 공세가 막혔습니다`,
          body: `아군 ${result.attackerLoss.toLocaleString()} 손실, 적 ${result.defenderLoss.toLocaleString()} 손실로 피만 흘린 채 물러났습니다. 병참과 재집결이 먼저입니다.`,
        });
      }
    }

    case 'declare_war': {
      diplomacy.declareWar(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      state.log(`${state.factions[params.targetFaction].name}에 선전포고!`, 'war');
      return recordResult({
        tone: 'warning',
        title: `${state.factions[params.targetFaction].name}에 선전포고했습니다`,
        body: '이제 말로 버티는 구간은 끝났습니다. 접경 도시가 즉시 불붙었고, 다음 선택은 방어선 정비 아니면 침공 준비여야 합니다.',
      });
    }

    case 'propose_peace': {
      const result = diplomacy.proposePeace(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      state.log(
        result.success ? `${state.factions[params.targetFaction].name}와 강화 성립!` : `${state.factions[params.targetFaction].name}이(가) 강화를 거절`,
        result.success ? 'diplomacy' : 'info'
      );
      return recordResult({
        tone: result.success ? 'diplomacy' : 'warning',
        title: result.success ? `${state.factions[params.targetFaction].name}와 강화를 맺었습니다` : `${state.factions[params.targetFaction].name}이 강화를 거절했습니다`,
        body: result.success ? '피로한 전선 하나가 잠시 멎었습니다. 지금이 숨을 고르고 내정이나 재배치로 넘어갈 창입니다.' : '상대는 물러설 생각이 없습니다. 전선 압박은 그대로 남았고, 외교 카드 한 장만 허공에 사라졌습니다.',
      });
    }

    case 'propose_alliance': {
      const result = diplomacy.proposeAlliance(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      state.log(
        result.success ? `${state.factions[params.targetFaction].name}와 동맹 체결!` : `${state.factions[params.targetFaction].name}이(가) 동맹을 거절`,
        result.success ? 'alliance' : 'info'
      );
      return recordResult({
        tone: result.success ? 'diplomacy' : 'warning',
        title: result.success ? `${state.factions[params.targetFaction].name}와 손을 잡았습니다` : `${state.factions[params.targetFaction].name}이 제안을 거절했습니다`,
        body: result.success ? '적어도 한 방향의 칼끝은 무뎌졌습니다. 이제 남는 행동력은 전선보다 성장에 더 세게 실을 수 있습니다.' : '상대는 아직 당신 편에 설 이유를 느끼지 못합니다. 병력 과시나 조공, 혹은 다른 전선 정리가 더 필요합니다.',
      });
    }

    case 'propose_marriage': {
      const result = diplomacy.proposeMarriage(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      state.log(
        result.success ? `${state.factions[params.targetFaction].name}와 혼인동맹!` : `${state.factions[params.targetFaction].name}이(가) 혼인을 거절`,
        result.success ? 'alliance' : 'info'
      );
      return recordResult({
        tone: result.success ? 'diplomacy' : 'warning',
        title: result.success ? `${state.factions[params.targetFaction].name}와 혼인동맹이 성사됐습니다` : `${state.factions[params.targetFaction].name}이 혼인을 거절했습니다`,
        body: result.success ? '이건 단순한 휴전이 아니라 장기 우호의 씨앗입니다. 다음 몇 턴 외교 기류가 한층 부드러워질 수 있습니다.' : '정치적 승부수를 던졌지만 받아들여지지 않았습니다. 지금은 외교보다 병력과 판세를 보여줄 때일 수 있습니다.',
      });
    }

    case 'send_tribute': {
      const result = diplomacy.sendTribute(state.player.factionId, params.targetFaction, params.amount, state);
      state.actionsRemaining--;
      if (result.success) state.log(`${state.factions[params.targetFaction].name}에 조공 (금 ${result.amount}, 평판 +${result.repGain})`, 'diplomacy');
      return recordResult({
        tone: result.success ? 'diplomacy' : 'warning',
        title: result.success ? `${state.factions[params.targetFaction].name}에 조공을 보냈습니다` : '조공 교섭이 뜻대로 풀리지 않았습니다',
        body: result.success ? `금으로 시간을 샀습니다. 평판이 조금 회복됐고 외교 숨통도 약간은 트였습니다.` : '자금만 나가고 분위기는 크게 바뀌지 않았습니다. 더 큰 정치 카드나 병력 우세가 필요합니다.',
      });
    }

    case 'threaten': {
      const result = diplomacy.threaten(state.player.factionId, params.targetFaction, state);
      state.actionsRemaining--;
      state.log(
        result.success ? `${state.factions[params.targetFaction].name}를 위협! (금 ${result.tribute} 획득)` : `${state.factions[params.targetFaction].name}이(가) 위협에 불응`,
        result.success ? 'diplomacy' : 'info'
      );
      return recordResult({
        tone: result.success ? 'military' : 'warning',
        title: result.success ? `${state.factions[params.targetFaction].name}을 굴복시켰습니다` : `${state.factions[params.targetFaction].name}이 위협에 버텼습니다`,
        body: result.success ? `금 ${result.tribute.toLocaleString()}을 받아냈습니다. 지금 천하는 당신이 먼저 칼을 쥐고 있다는 사실을 분명히 봤습니다.` : '상대는 당신의 압박을 허세로 받아들였습니다. 전장에서 우세를 보이기 전까지는 말이 잘 먹히지 않습니다.',
      });
    }

    case 'search_talent': {
      const myChars = state.getCharactersInCity(params.cityId).filter((char) => char.faction === state.player.factionId);
      const searcher = myChars.sort((a, b) => b.stats.charisma - a.stats.charisma)[0];
      if (!searcher) {
        state.log('탐색할 장수가 없습니다', 'info');
        state.actionsRemaining--;
        return recordResult({
          tone: 'warning',
          title: '탐색 장수가 없습니다',
          body: '현재 도시에 탐색을 맡길 장수가 없어 인재 수색이 흐지부지됐습니다.',
        });
      }

      const result = charMgr.searchForTalent(params.cityId, searcher.id, state);
      state.actionsRemaining--;
      if (result.found) {
        const recruitResult = charMgr.offerRecruitment(result.character.id, searcher.id, state.player.factionId, state);
        state.log(
          recruitResult.accepted ? `인재 발견! ${getCharName(result.character.id)} 등용 성공` : `인재 발견: ${getCharName(result.character.id)} — 등용 거절`,
          recruitResult.accepted ? 'recruit' : 'info'
        );
      } else {
        state.log(`${state.cities[params.cityId].name}에서 인재를 찾지 못함`, 'info');
      }
      return recordResult({
        tone: result.found && result.character ? 'growth' : 'neutral',
        title: result.found && result.character ? `${getCharName(result.character.id)}의 흔적을 발견했습니다` : `${state.cities[params.cityId].name}에서는 소득이 없었습니다`,
        body: result.found && result.character ? '탐색이 실제 인재 카드로 이어졌습니다.' : '이번 턴 탐색은 헛걸음이었습니다. 다른 도시나 다른 장수가 더 낫습니다.',
      });
    }

    case 'persuade_captive': {
      const myChars = state.getCharactersInCity(params.cityId).filter((char) => char.faction === state.player.factionId);
      const persuader = myChars.sort((a, b) => b.stats.charisma - a.stats.charisma)[0];
      if (!persuader) return false;

      const result = charMgr.persuadeCaptive(params.captiveId, persuader.id, state.player.factionId, state);
      state.actionsRemaining--;
      state.log(
        result.success ? `포로 ${getCharName(params.captiveId)} 등용 성공!` : `포로 ${getCharName(params.captiveId)}이(가) 설득을 거부 (${result.reason})`,
        result.success ? 'recruit' : 'info'
      );
      return recordResult({
        tone: result.success ? 'growth' : 'warning',
        title: result.success ? `${getCharName(params.captiveId)}를 끌어들였습니다` : `${getCharName(params.captiveId)}가 끝내 버텼습니다`,
        body: result.success ? '포로가 아군 인재로 전환됐습니다.' : `설득 실패 사유: ${result.reason}`,
      });
    }

    case 'release_captive': {
      state.releaseCaptive(params.captiveId);
      state.actionsRemaining--;
      state.log(`포로 ${getCharName(params.captiveId)} 석방`, 'info');
      return recordResult({
        tone: 'neutral',
        title: `${getCharName(params.captiveId)}를 석방했습니다`,
        body: '직접 전력은 잃었지만 강경 일변도의 흐름은 피했습니다.',
      });
    }

    case 'reward_officer': {
      const result = charMgr.rewardOfficer(state, params.charId, params.goldCost || 1000);
      if (!result.success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}에게 포상 (충성 +${result.loyaltyGain})`, 'reward');
      return recordResult({
        tone: 'growth',
        title: `${getCharName(params.charId)}의 충성을 다졌습니다`,
        body: `포상으로 충성도가 +${result.loyaltyGain} 상승했습니다.`,
      });
    }

    case 'bestow_item': {
      const result = charMgr.bestowItem(state, params.charId, params.itemId);
      if (!result.success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}에게 ${getItemName(params.itemId)} 하사 (충성 +${result.loyaltyGain})`, 'reward');
      return recordResult({
        tone: 'growth',
        title: `${getItemName(params.itemId)}을(를) 하사했습니다`,
        body: `${getCharName(params.charId)}의 충성도가 +${result.loyaltyGain} 상승했습니다.`,
      });
    }

    case 'confiscate_item': {
      const result = charMgr.confiscateEquippedItem(state, params.charId, params.slot || null);
      if (!result.success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}에게서 ${result.itemName} 회수 (충성 -${result.loyaltyLoss})`, 'warning');
      return recordResult({
        tone: 'warning',
        title: `${result.itemName}을(를) 회수했습니다`,
        body: `${getCharName(params.charId)}의 충성도가 ${result.loyaltyLoss} 하락했습니다.`,
      });
    }

    case 'dismiss_officer': {
      const result = charMgr.dismissOfficer(state, params.charId);
      if (!result.success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}를 해임해 방랑 인재로 전환 (평판 -${result.reputationLoss})`, 'warning');
      return recordResult({
        tone: 'warning',
        title: `${getCharName(params.charId)}를 해임했습니다`,
        body: `세력 평판이 ${result.reputationLoss} 하락했고 해당 장수는 방랑 인재가 됐습니다.`,
      });
    }

    case 'appoint_tactician': {
      const success = state.appointTactician(params.charId, state.player.factionId);
      if (!success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}를 세력 책사로 임명`, 'player');
      return recordResult({
        tone: 'growth',
        title: `${getCharName(params.charId)}를 책사로 세웠습니다`,
        body: '이제 도시 브리프와 조언 문구가 더 선명하게 전개됩니다.',
      });
    }

    case 'set_city_policy': {
      const success = state.setCityPolicy(params.cityId, { [params.policyType]: params.value });
      if (!success) return false;
      state.actionsRemaining--;
      const city = state.cities[params.cityId];
      const policy = getCityPolicy(city);
      const policyName = params.policyType === 'militaryPosture' ? policy.military.name : policy.domestic.name;
      state.log(`${city.name} 정책을 ${policyName}로 전환`, 'player');
      return recordResult({
        tone: params.policyType === 'militaryPosture' ? 'military' : 'growth',
        title: `${city.name} 정책을 ${policyName}로 바꿨습니다`,
        body: '다음 몇 턴의 도시 성장과 전선 대응 방향이 달라집니다.',
      });
    }

    case 'move_general': {
      const result = charMgr.transferOfficer(state, params.charId, params.toCity);
      if (!result.success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}를 ${state.cities[params.toCity].name}으로 이동`, 'player');
      return recordResult({
        tone: 'neutral',
        title: `${getCharName(params.charId)}를 이동시켰습니다`,
        body: `${state.cities[params.toCity].name} 쪽 인재 배치를 다시 짰습니다.`,
      });
    }

    case 'appoint_governor': {
      const success = state.appointGovernor(params.charId, params.cityId);
      if (!success) return false;
      state.actionsRemaining--;
      state.log(`${getCharName(params.charId)}를 ${state.cities[params.cityId].name} 태수로 임명`, 'player');
      return recordResult({
        tone: 'growth',
        title: `${getCharName(params.charId)}를 태수로 임명했습니다`,
        body: `${state.cities[params.cityId].name}의 월간 성장 판단이 달라집니다.`,
      });
    }

    case 'build': {
      const result = startConstruction(state, params.cityId, params.buildingId);
      if (!result.success) return false;
      state.actionsRemaining--;
      return recordResult({
        tone: 'growth',
        title: `${BUILDINGS[params.buildingId]?.name || params.buildingId} 공사를 시작했습니다`,
        body: `${state.cities[params.cityId].name}의 장기 효율을 끌어올리는 투자입니다.`,
      });
    }

    case 'start_research': {
      const result = startResearch(state, state.player.factionId, params.techId);
      if (!result.success) return false;
      state.actionsRemaining--;
      const tech = TECHS[params.techId];
      state.log(`${tech?.name || params.techId} 연구 시작 (${result.turns}턴)`, 'research');
      return recordResult({
        tone: 'growth',
        title: `${tech?.name || params.techId} 연구를 시작했습니다`,
        body: `${result.turns}턴 뒤 세력 전체 보너스로 이어집니다.`,
      });
    }

    case 'espionage': {
      const result = executeEspionage(state, params.spyId, params.targetCityId, params.actionType);
      state.actionsRemaining--;
      if (result.success) {
        state.log(`첩보 성공: ${result.actionName}`, 'espionage');
      } else {
        let message = `첩보 실패: ${result.actionName}`;
        if (result.captured) message += ' (첩자 포로!)';
        state.log(message, 'espionage');
      }
      return recordResult({
        tone: result.success ? 'diplomacy' : 'warning',
        title: result.success ? `${result.actionName}이 성공했습니다` : `${result.actionName}이 실패했습니다`,
        body: result.success ? '은밀한 선택이 다음 턴 판세를 흔들 여지를 만들었습니다.' : (result.captured ? '첩자가 포로로 잡혀 역풍이 불 수 있습니다.' : '위험만 감수하고 실익은 얻지 못했습니다.'),
      });
    }

    case 'move_troops': {
      const result = moveArmy(state, params.fromCity, params.toCity, params.amount, params.generals || [], params.connections || connections);
      if (!result.success) return false;
      state.actionsRemaining--;
      return recordResult({
        tone: 'military',
        title: `${state.cities[params.toCity].name}로 병력을 이동했습니다`,
        body: `${params.amount.toLocaleString()}명이 재배치되어 전선 두께가 달라졌습니다.`,
      });
    }

    case 'transport_food': {
      const result = transportFood(state, params.fromCity, params.toCity, params.amount, params.connections || connections);
      if (!result.success) return false;
      state.actionsRemaining--;
      return recordResult({
        tone: 'growth',
        title: `${state.cities[params.toCity].name}로 군량을 보냈습니다`,
        body: `${params.amount.toLocaleString()}의 식량이 이동해 병참선이 한결 안정됐습니다.`,
      });
    }

    case 'trade_food': {
      const result = tradeFood(state, params.cityId, params.amount, params.mode);
      if (!result.success) return false;
      state.actionsRemaining--;
      state.log(
        params.mode === 'buy'
          ? `${state.cities[params.cityId].name} 시장에서 군량 ${result.amount.toLocaleString()} 매입 (금 -${result.gold.toLocaleString()})`
          : `${state.cities[params.cityId].name} 시장에서 군량 ${result.amount.toLocaleString()} 매각 (금 +${result.gold.toLocaleString()})`,
        'player'
      );
      return recordResult({
        tone: 'growth',
        title: params.mode === 'buy' ? '군량을 매입했습니다' : '군량을 매각했습니다',
        body: params.mode === 'buy'
          ? `${state.cities[params.cityId].name}의 비축량을 늘렸습니다.`
          : `${state.cities[params.cityId].name}에서 금을 회수했습니다.`,
      });
    }

    default:
      return false;
  }
}

function getTrackImpactLabel(trackKey, forecast) {
  if (trackKey === 'agriculture') return `예상 식량 ${signed(forecast.foodDelta)}`;
  if (trackKey === 'commerce') return `예상 금 ${signed(forecast.goldDelta)}`;
  if (trackKey === 'publicOrder') return forecast.risks.includes('반란 위험') ? '반란 위험 완화' : '치안 안정';
  if (trackKey === 'technology') return forecast.bonuses[0] || '연구·모집·방어 효율';
  return '';
}

function signed(value) {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
}

function seasonLabel(season) {
  return {
    spring: '춘계 시세',
    summer: '하계 시세',
    autumn: '추계 시세',
    winter: '동계 시세',
  }[season] || '당월 시세';
}

function tradeReasonLabel(reason) {
  return {
    invalid_city: '도시 정보가 없습니다.',
    invalid_faction: '세력 정보가 없습니다.',
    invalid_amount: '거래량이 너무 적습니다.',
    insufficient_gold: '세력 자금이 부족합니다.',
    insufficient_food_buffer: '최소 비축량을 남기지 못합니다.',
  }[reason] || '거래 조건이 아직 맞지 않습니다.';
}

function conscriptReasonLabel(reason) {
  return {
    invalid_city: '도시 정보가 없습니다.',
    invalid_faction: '세력 정보가 없습니다.',
    public_order_too_low: '치안이 낮아 징병 불가',
    population_too_low: '인구 여력이 부족합니다.',
    insufficient_gold: '자금이 부족합니다.',
    insufficient_food: '군량이 부족합니다.',
    no_manpower: '당장 동원할 인력이 없습니다.',
  }[reason] || '징병 조건이 아직 갖춰지지 않았습니다.';
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString() : '—';
}

function formatBuildingEffects(buildingId) {
  const effects = BUILDINGS[buildingId]?.effects || {};
  return Object.entries(effects).map(([key, value]) => {
    if (key === 'commerce') return `상업 +${value}%`;
    if (key === 'technology') return `기술 +${value}%`;
    if (key === 'recruitEfficiency') return `모집 +${Math.round(value * 100)}%`;
    if (key === 'morale') return `사기 +${value}`;
    if (key === 'defense') return `방어 +${value}`;
    if (key === 'espionageDefense') return `첩보 방어 +${Math.round(value * 100)}%`;
    if (key === 'foodPreservation') return `식량 보존 +${Math.round(value * 100)}%`;
    if (key === 'techSpeed') return `연구 속도 +${Math.round(value * 100)}%`;
    return `${key} ${value}`;
  }).join(' · ');
}

function formatTechEffects(techId) {
  const effects = TECHS[techId]?.effects || {};
  return Object.entries(effects).map(([key, value]) => {
    if (key === 'combatAttack') return `공격 +${Math.round(value * 100)}%`;
    if (key === 'siegeBonus') return `공성 +${Math.round(value * 100)}%`;
    if (key === 'rangedAttack') return `원거리 +${Math.round(value * 100)}%`;
    if (key === 'cavalryBonus') return `기병 +${Math.round(value * 100)}%`;
    if (key === 'plainsBonus') return `평지 +${Math.round(value * 100)}%`;
    if (key === 'navalBonus') return `수전 +${Math.round(value * 100)}%`;
    if (key === 'agricultureBonus') return `농업 +${Math.round(value * 100)}%`;
    if (key === 'commerceBonus') return `상업 +${Math.round(value * 100)}%`;
    if (key === 'taxBonus') return `세수 +${Math.round(value * 100)}%`;
    if (key === 'healRate') return `성장 +${Math.round(value * 100)}%`;
    if (key === 'moraleRecovery') return `사기 기준 +${value}`;
    if (key === 'espionageBonus') return `첩보 +${Math.round(value * 100)}%`;
    if (key === 'diplomacyBonus') return `외교 +${Math.round(value * 100)}%`;
    if (key === 'reputationGain') return `평판 획득 +${Math.round(value * 100)}%`;
    return `${key} ${value}`;
  }).join(' · ');
}
