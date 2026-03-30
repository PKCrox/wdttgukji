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
    this.progressBar = document.getElementById('tr-progress-bar');
    this.progressFill = document.getElementById('tr-progress-fill');
    this.phaseLabel = document.getElementById('tr-phase-label');
    this.itemsContainer = document.getElementById('tr-items');
    this.counter = document.getElementById('tr-counter');
    this.logContent = document.getElementById('turn-log-content');

    this.items = [];
    this.currentIndex = 0;
    this.currentPhase = null;
    this.resolveComplete = null;
    this._autoTimer = null;
    this._speed = 1;
    this._streamBlock = null;

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

  show(items) {
    this.items = items;
    this.currentIndex = 0;
    this.currentPhase = null;
    this._speed = 1;
    this.itemsContainer.innerHTML = '';
    this.progressFill.style.width = '0%';
    this.phaseLabel.textContent = '';
    this.counter.textContent = `0 / ${items.length}`;
    this._prepareStreamBlock();

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
    }

    this._appendPanelItem(item);
    this._appendLedgerItem(item);

    this.currentIndex += 1;
    const pct = (this.currentIndex / this.items.length) * 100;
    this.progressFill.style.width = `${pct}%`;
    this.counter.textContent = `${this.currentIndex} / ${this.items.length}`;
    this.itemsContainer.scrollTop = this.itemsContainer.scrollHeight;
    if (this.logContent) this.logContent.scrollTop = 0;
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
    this._streamBlock = null;
    if (this.resolveComplete) {
      this.resolveComplete();
      this.resolveComplete = null;
    }
  }

  _prepareStreamBlock() {
    if (!this.logContent) return;
    this._streamBlock?.remove();
    const block = document.createElement('section');
    block.className = 'chronicle-live-turn';
    block.innerHTML = `
      <div class="chronicle-live-head">
        <span class="chronicle-live-kicker">실시간 결산</span>
        <span class="chronicle-live-state">이번 달 판세 정리 중</span>
      </div>
    `;
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
