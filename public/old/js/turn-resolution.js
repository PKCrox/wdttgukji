import { buildTurnResolutionDirectorPacket, getBattlefieldSessionLines } from './turn-director.js';
import { getFactionSurfaceTheme } from './presentation-meta.js';

const LOG_ICONS = {
  event: '📜', ai_choice: '🤖', player_choice: '⚡',
  war: '⚔️', ai: '🏴', alliance: '🤝', territory: '🏰',
  diplomacy: '📋', warning: '⚠️', defection: '💔',
  rebellion: '🔥', captive: '⛓', death: '💀',
  recruit: '📢', construction: '🔨', research: '📚',
  income: '💰', food: '🌾', movement: '➡️', gameover: '👑',
  player: '🎯', espionage: '🕵', reward: '🎁', logistics: '🚚', info: '•',
};

const TYPE_DELAY = {
  event: 1200, war: 1400, territory: 1400, alliance: 1200,
  death: 1500, rebellion: 1400, gameover: 2000,
  ai: 600, ai_choice: 600, info: 500,
  income: 400, food: 400, construction: 500, research: 500,
  diplomacy: 800, recruit: 700, captive: 800, espionage: 700,
  player: 800, reward: 800, logistics: 700, defection: 1000, warning: 900,
};
const DEFAULT_DELAY = 700;

export function getLogIcon(type) {
  return LOG_ICONS[type] || '•';
}

export class TurnResolution {
  constructor() {
    this.panel = document.getElementById('turn-resolution');
    this.directorKicker = document.getElementById('tr-director-kicker');
    this.directorTitle = document.getElementById('tr-director-title');
    this.directorBody = document.getElementById('tr-director-body');
    this.sessionBoard = document.getElementById('tr-session-board');
    this.progressBar = document.getElementById('tr-progress-bar');
    this.progressFill = document.getElementById('tr-progress-fill');
    this.phaseLabel = document.getElementById('tr-phase-label');
    this.itemsContainer = document.getElementById('tr-items');
    this.counter = document.getElementById('tr-counter');
    this.logContent = document.getElementById('turn-log-content');

    this.items = [];
    this.currentIndex = 0;
    this.currentPhase = null;
    this._state = null;
    this.resolveComplete = null;
    this._autoTimer = null;
    this._speed = 1;
    this._streamBlock = null;
    this._directorPhaseGuide = {};
    this._directorPlaybook = [];
    this._directorGuideApplied = false;
    this._directorDecisionGuideApplied = false;
    this._directorLines = [];
    this._directorDecisionLines = [];
    this._directorPacket = null;
    this._directorSessionFocus = [];
    this._directorSessionLines = [];

    this.panel.addEventListener('click', (e) => {
      if (e.target.id === 'tr-skip') return;
      this._clearAutoTimer();
      this.advance();
      this._scheduleNext();
    });

    document.getElementById('tr-skip').addEventListener('click', () => this.skipAll());
    this._keyHandler = (e) => {
      if (this.panel.classList.contains('hidden')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this._clearAutoTimer();
        this.advance();
        this._scheduleNext();
      } else if (e.key === 'Escape') {
        this.skipAll();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  show(items, options = {}) {
    this.items = items;
    this.currentIndex = 0;
    this.currentPhase = null;
    this._state = options.state || null;
    this._speed = 1;
    const director = buildTurnResolutionDirectorPacket({
      items,
      state: options.state || null,
      summaryItems: options.summaryItems || [],
    });
    this.itemsContainer.innerHTML = '';
    this.progressFill.style.width = '0%';
    this.phaseLabel.textContent = '';
    this.counter.textContent = `0 / ${items.length}`;
    this._directorPhaseGuide = director.phaseGuide || {};
    this._directorPlaybook = Array.isArray(director.playbook) ? director.playbook : [];
    this._directorPacket = director;
    this._directorSessionFocus = this._resolveSessionLines(director, 5);
    this._directorDecisionLines = this._directorSessionFocus;
    this._directorSessionLines = this._directorDecisionLines.slice(0, 5);
    this._directorDecisionGuideApplied = false;
    this._directorGuideApplied = false;
    this._directorLines = this._buildDirectorLines(director);
    this._prepareStreamBlock(director);
    const theme = getFactionSurfaceTheme(this._state?.player?.factionId);
    if (this.directorKicker) this.directorKicker.textContent = director.kicker || theme.resolutionKicker || '월말 전황';
    if (this.directorTitle) this.directorTitle.textContent = director.headline || '이번 달 결과를 정리합니다.';
    this._refreshDirectorBody();
    this._refreshSessionBoard();

    this.panel.classList.remove('hidden');
    this.progressBar.classList.remove('hidden');

    this.advance();
    this._scheduleNext();

    return new Promise((resolve) => {
      this.resolveComplete = resolve;
    });
  }

  advance() {
    if (this.currentIndex >= this.items.length) {
      this._clearAutoTimer();
      setTimeout(() => this.close(), 450);
      return;
    }

    const item = this.items[this.currentIndex];
    if (item.phase !== this.currentPhase) {
      this.currentPhase = item.phase;
      this.phaseLabel.textContent = item.phase;
      this._appendPhaseDivider(item.phase);
      this._appendPanelDivider(item.phase);
      this._appendPanelDirectorGuide(item.phase);
    }

    this._appendPanelItem(item);
    this._appendLedgerItem(item);

    this.currentIndex += 1;
    const pct = (this.currentIndex / this.items.length) * 100;
    this.progressFill.style.width = `${pct}%`;
    this.counter.textContent = `${this.currentIndex} / ${this.items.length}`;
    this._refreshDirectorBody();
    this._refreshSessionBoard();
    this.itemsContainer.scrollTop = this.itemsContainer.scrollHeight;
    if (this.logContent) this.logContent.scrollTop = 0;
  }

  _appendPanelDirectorGuide(phase) {
    const guide = this._directorPhaseGuide?.[phase];
    if (guide) {
      this._appendPanelItem({
        icon: '🧭',
        text: guide,
        type: 'info',
      });
    }
    if (!this._directorDecisionGuideApplied && this._directorDecisionLines?.length > 0) {
      this._directorDecisionLines.slice(0, 2).forEach((entry, index) => {
        this._appendPanelItem({
          icon: index === 0 ? '🎯' : '◦',
          text: `판정면 ${entry}`,
          type: 'info',
        });
      });
      this._directorDecisionGuideApplied = true;
    }
    if (this._directorGuideApplied || !Array.isArray(this._directorPlaybook) || this._directorPlaybook.length === 0) return;
    this._directorPlaybook.slice(0, 3).forEach((entry, index) => {
      this._appendPanelItem({
        icon: '▶',
        text: `우선순위 ${index + 1}: ${entry}`,
        type: 'info',
      });
    });
    this._directorGuideApplied = true;
  }

  _buildDirectorLines(director) {
    if (!director) return [];
    const decisionLines = this._resolveSessionLines(director, 4);
    const bodyLine = director.body || '이벤트와 결산을 한 세션의 판단면으로 이어갑니다.';
    return [
      ...decisionLines.slice(0, 2).map((line) => `판정면: ${line}`),
      bodyLine,
      ...decisionLines.slice(2).map((line) => `판정면: ${line}`),
      ...(Array.isArray(director.playbook) ? director.playbook.slice(0, 2).map((entry) => `우선순위: ${entry}`) : []),
    ].filter(Boolean);
  }

  _resolveSessionLines(director, maxLines = 5) {
    return getBattlefieldSessionLines(director, maxLines);
  }

  _refreshDirectorBody() {
    if (!this.directorBody) return;
    const focusLines = this._directorSessionFocus?.length > 0 ? this._directorSessionFocus.slice(0, 2) : [];
    const supportingLines = this._directorSessionFocus?.length > 0 ? this._directorSessionFocus.slice(2, 4) : [];
    const bodyLine = this._directorLines?.find((line) => typeof line === 'string' && !line.startsWith('판정면:')) || null;
    const summaryLines = [
      ...focusLines,
      bodyLine || '이벤트와 결산을 한 세션의 판단면으로 이어갑니다.',
      ...supportingLines,
      `세션 진행: ${this.currentIndex} / ${this.items.length}`,
    ];
    this._setTextLines(this.directorBody, summaryLines.filter(Boolean));
  }

  _escapeHtml(value) {
    return `${value ?? ''}`
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  _firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && `${value}`.trim() !== '');
  }

  _truncateText(text, max = 64) {
    const value = `${text || ''}`.trim();
    if (!value) return '';
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(18, max - 1)).trim()}…`;
  }

  _pickDecisionFrame(director = {}) {
    return director.battlefieldSession
      || director.decisionSurface
      || director.sessionTrace
      || director.decisionFrame
      || director
      || {};
  }

  _setTextLines(target, lines = []) {
    target.textContent = '';
    const safeLines = lines.filter(Boolean);
    safeLines.forEach((line, index) => {
      if (index > 0) target.appendChild(document.createElement('br'));
      target.appendChild(document.createTextNode(line));
    });
  }

  _summarizeResolutionMix() {
    const counts = {
      conflict: 0,
      crisis: 0,
      logistics: 0,
      report: 0,
    };

    this.items.forEach((item) => {
      switch (item?.type) {
        case 'war':
        case 'territory':
        case 'alliance':
        case 'diplomacy':
        case 'espionage':
        case 'movement':
          counts.conflict += 1;
          break;
        case 'warning':
        case 'rebellion':
        case 'defection':
        case 'death':
        case 'captive':
        case 'gameover':
          counts.crisis += 1;
          break;
        case 'income':
        case 'food':
        case 'construction':
        case 'research':
        case 'recruit':
        case 'reward':
        case 'logistics':
          counts.logistics += 1;
          break;
        default:
          counts.report += 1;
          break;
      }
    });

    return counts;
  }

  _buildMixLine(counts) {
    const parts = [];
    if (counts.conflict > 0) parts.push(`전선 ${counts.conflict}`);
    if (counts.crisis > 0) parts.push(`경고 ${counts.crisis}`);
    if (counts.logistics > 0) parts.push(`정산 ${counts.logistics}`);
    if (counts.report > 0) parts.push(`보고 ${counts.report}`);
    return parts.join(' · ') || '정세 보고 대기';
  }

  _buildSessionBoardCards(director = {}) {
    const focusCity = this._firstDefined(
      director.focusCity,
      director.decisionCity,
      director.cityName,
      director.battlefieldSession?.cityName,
      director.battlefieldSession?.title,
      '전장 전체',
    );
    const scene = this._firstDefined(
      director.focusScene,
      director.scene,
      director.battlefieldSession?.scene,
      director.battlefieldSession?.sceneLabel,
      '전장 정렬',
    );
    const actionLine = this._firstDefined(
      director.nextAction,
      director.battlefieldSession?.nextAction,
      director.playbook?.[2],
      director.body,
      '다음 행동을 정리 중입니다.',
    );
    const frontline = this._firstDefined(
      director.frontline,
      director.mapReadout,
      director.battlefieldSession?.mapReadout,
      this._directorSessionFocus?.[0],
      '전선 판독 정리 중',
    );
    const counts = this._summarizeResolutionMix();
    const mixLine = this._buildMixLine(counts);

    return [
      {
        label: '주전장',
        title: this._truncateText(focusCity, 24),
        detail: this._truncateText(frontline, 72),
        tone: 'primary',
      },
      {
        label: '결산 장면',
        title: this._truncateText(scene, 24),
        detail: this._truncateText(director.playbook?.[0] || director.playbook?.[1] || '월말 판단면 유지', 72),
        tone: 'scene',
      },
      {
        label: '다음 액션',
        title: this._truncateText(actionLine, 34),
        detail: this._truncateText(director.body || director.playbook?.[2] || '다음 달 첫 명령을 정리 중입니다.', 76),
        tone: 'risk',
      },
      {
        label: '세션 진행',
        title: `${this.currentIndex} / ${this.items.length}`,
        detail: `${this.currentPhase || '오프닝'} · ${mixLine}`,
        tone: 'summary',
      },
    ];
  }

  _refreshSessionBoard() {
    if (!this.sessionBoard) return;
    const director = this._directorPacket || {};
    const theme = getFactionSurfaceTheme(this._state?.player?.factionId);
    const focusLine = this._directorSessionLines?.length > 0
      ? this._directorSessionLines.slice(0, 2).join(' · ')
      : director.body || '이달 결산의 주전장과 다음 액션을 정리합니다.';
    const cards = this._buildSessionBoardCards(director);
    this.sessionBoard.innerHTML = `
      <section class="tr-session-board" data-state="${this.currentIndex >= this.items.length && this.items.length > 0 ? 'complete' : 'active'}">
        <div class="tr-session-head">
          <div class="tr-session-copy">
            <span class="tr-session-kicker">${this._escapeHtml(theme.resolutionKicker || '월말 결산판')}</span>
            <strong>${this._escapeHtml(this._truncateText(director.headline || '이번 달 결과를 정리합니다.', 54))}</strong>
            <small>${this._escapeHtml(this._truncateText(focusLine, 132))}</small>
          </div>
          <span class="tr-session-state">${this._escapeHtml(this.currentPhase || '대기')}</span>
        </div>
        <div class="tr-session-grid">
          ${cards.map((card) => `
            <article class="tr-session-card tone-${card.tone}">
              <span class="tr-session-card-label">${this._escapeHtml(card.label)}</span>
              <strong>${this._escapeHtml(card.title)}</strong>
              <small>${this._escapeHtml(card.detail)}</small>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  _scheduleNext() {
    this._clearAutoTimer();
    if (this.currentIndex >= this.items.length) return;
    const nextItem = this.items[this.currentIndex];
    const delay = Math.max(200, (TYPE_DELAY[nextItem?.type] || DEFAULT_DELAY) / this._speed);
    this._autoTimer = setTimeout(() => {
      this.advance();
      this._scheduleNext();
    }, delay);
  }

  _clearAutoTimer() {
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
  }

  skipAll() {
    this._clearAutoTimer();
    while (this.currentIndex < this.items.length) {
      this.advance();
    }
    this.close();
  }

  close() {
    this._clearAutoTimer();
    this.panel.classList.add('hidden');
    this.progressBar.classList.add('hidden');
    this._state = null;
    this._streamBlock = null;
    if (this.resolveComplete) {
      this.resolveComplete();
      this.resolveComplete = null;
    }
  }

  _prepareStreamBlock(director) {
    if (!this.logContent) return;
    this._streamBlock?.remove();
    const block = document.createElement('section');
    block.className = 'chronicle-live-turn';
    const head = document.createElement('div');
    head.className = 'chronicle-live-head';
    const kicker = document.createElement('span');
    kicker.className = 'chronicle-live-kicker';
    kicker.textContent = '실시간 결산';
    const state = document.createElement('span');
    state.className = 'chronicle-live-state';
    const decisionFocus = this._directorSessionLines?.length > 0 ? this._directorSessionLines.slice(0, 2).join(' · ') : '';
    state.textContent = `${decisionFocus || director.body || '이번 달 판세 정리 중'}${decisionFocus ? ` · ${director.body || '판단면 정리 중'}` : ''}`;
    const meta = this._directorSessionLines.map((entry) => entry.replace(/^(판독 도시|장면|전선|다음 행동|다음 액션|지도 판독|선택 도시): /u, '$1:'));
    const focus = document.createElement('div');
    focus.className = 'chronicle-live-focus';
    if (meta.length > 0) {
      focus.textContent = meta.join(' · ');
    }
    head.appendChild(kicker);
    head.appendChild(state);
    block.appendChild(head);
    if (meta.length > 0) block.appendChild(focus);
    this._directorLines.slice(0, 5).forEach((line) => {
      const row = document.createElement('div');
      row.className = 'chronicle-live-entry info';
      row.textContent = `▶ ${line}`;
      block.appendChild(row);
    });
    this.logContent.prepend(block);
    this._streamBlock = block;
  }

  _appendPhaseDivider(phase) {
    if (!this._streamBlock) return;
    const divider = document.createElement('div');
    divider.className = 'chronicle-live-phase';
    divider.textContent = phase;
    this._streamBlock.appendChild(divider);
  }

  _appendLedgerItem(item) {
    if (!this._streamBlock) return;
    const entry = document.createElement('div');
    entry.className = `chronicle-live-entry ${item.type || 'info'}`;
    entry.innerHTML = `
      <span class="chronicle-live-icon">${item.icon || '•'}</span>
      <span class="chronicle-live-text">${item.text}</span>
    `;
    this._streamBlock.appendChild(entry);
  }

  _appendPanelDivider(phase) {
    const divider = document.createElement('div');
    divider.className = 'tr-phase-divider';
    divider.textContent = `— ${phase} —`;
    this.itemsContainer.appendChild(divider);
  }

  _appendPanelItem(item) {
    const el = document.createElement('div');
    el.className = `tr-item ${item.type || 'info'}`;
    el.innerHTML = `<span class="tr-icon">${item.icon || '•'}</span><span class="tr-text">${item.text}</span>`;
    this.itemsContainer.appendChild(el);

    while (this.itemsContainer.children.length > 14) {
      const old = this.itemsContainer.firstChild;
      old.classList.add('tr-fade-out');
      setTimeout(() => old.remove(), 180);
    }
  }
}
