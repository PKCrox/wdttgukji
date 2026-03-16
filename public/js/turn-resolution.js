// TurnResolution — 턴 결산 UI
// 상단 알림 피드 + 프로그레스 바. 자동 진행 (클릭 불필요).

const LOG_ICONS = {
  event: '📜', ai_choice: '🤖', player_choice: '⚡',
  war: '⚔️', ai: '🏴', alliance: '🤝', territory: '🏰',
  diplomacy: '📋', warning: '⚠️', defection: '💔',
  rebellion: '🔥', captive: '⛓', death: '💀',
  recruit: '📢', construction: '🔨', research: '📚',
  income: '💰', food: '🌾', gameover: '👑',
  player: '🎯', info: '•',
};

// 타입별 표시 속도 (ms) — 중요한 건 길게, 루틴은 짧게
const TYPE_DELAY = {
  event: 1200, war: 1400, territory: 1400, alliance: 1200,
  death: 1500, rebellion: 1400, gameover: 2000,
  ai: 600, ai_choice: 600, info: 500,
  income: 400, food: 400, construction: 500, research: 500,
  diplomacy: 800, recruit: 700, captive: 800,
  player: 800, defection: 1000, warning: 900,
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

    this.items = [];
    this.currentIndex = 0;
    this.currentPhase = null;
    this.resolveComplete = null;
    this._autoTimer = null;
    this._speed = 1; // 1x 기본, 2x 빠르게

    // 클릭하면 즉시 다음 항목 + 타이머 리셋
    this.panel.addEventListener('click', (e) => {
      if (e.target.id === 'tr-skip') return;
      this._clearAutoTimer();
      this.advance();
      this._scheduleNext();
    });

    // 건너뛰기
    document.getElementById('tr-skip').addEventListener('click', () => {
      this.skipAll();
    });

    // 키보드: Space = 즉시 다음, Escape = 전부 건너뛰기
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

  /**
   * 결산 UI 표시 — 자동 진행
   * @param {Array<{phase, icon, text, type}>} items
   * @returns {Promise<void>} 닫힐 때 resolve
   */
  show(items) {
    this.items = items;
    this.currentIndex = 0;
    this.currentPhase = null;
    this._speed = 1;

    this.itemsContainer.innerHTML = '';
    this.progressFill.style.width = '0%';
    this.phaseLabel.textContent = '';
    this.counter.textContent = `0 / ${items.length}`;

    this.panel.classList.remove('hidden');
    this.progressBar.classList.remove('hidden');

    // 첫 항목 즉시 표시 + 자동 진행 시작
    this.advance();
    this._scheduleNext();

    return new Promise(resolve => {
      this.resolveComplete = resolve;
    });
  }

  advance() {
    if (this.currentIndex >= this.items.length) {
      this._clearAutoTimer();
      // 마지막 항목 잠시 보여준 뒤 닫기
      setTimeout(() => this.close(), 600);
      return;
    }

    const item = this.items[this.currentIndex];

    // 페이즈 변경 시 구분선
    if (item.phase !== this.currentPhase) {
      this.currentPhase = item.phase;
      this.phaseLabel.textContent = item.phase;

      const divider = document.createElement('div');
      divider.className = 'tr-phase-divider';
      divider.textContent = `— ${item.phase} —`;
      this.itemsContainer.appendChild(divider);
    }

    // 항목 생성
    const el = document.createElement('div');
    el.className = `tr-item ${item.type || ''}`;
    el.innerHTML = `<span class="tr-icon">${item.icon || '•'}</span><span class="tr-text">${item.text}</span>`;
    this.itemsContainer.appendChild(el);

    // 오래된 항목 제거 (최대 12개 유지)
    while (this.itemsContainer.children.length > 15) {
      const old = this.itemsContainer.firstChild;
      old.classList.add('tr-fade-out');
      setTimeout(() => old.remove(), 200);
    }

    this.currentIndex++;

    // 프로그레스 바
    const pct = (this.currentIndex / this.items.length) * 100;
    this.progressFill.style.width = `${pct}%`;
    this.counter.textContent = `${this.currentIndex} / ${this.items.length}`;

    // 자동 스크롤
    this.itemsContainer.scrollTop = this.itemsContainer.scrollHeight;
  }

  /** 다음 항목 자동 타이머 예약 */
  _scheduleNext() {
    this._clearAutoTimer();
    if (this.currentIndex >= this.items.length) return;

    const nextItem = this.items[this.currentIndex];
    const baseDelay = TYPE_DELAY[nextItem?.type] || DEFAULT_DELAY;
    const delay = Math.max(200, baseDelay / this._speed);

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
      const item = this.items[this.currentIndex];
      if (item.phase !== this.currentPhase) {
        this.currentPhase = item.phase;
        this.phaseLabel.textContent = item.phase;
      }
      this.currentIndex++;
    }
    // 마지막 상태만 프로그레스에 반영
    this.progressFill.style.width = '100%';
    this.counter.textContent = `${this.items.length} / ${this.items.length}`;
    this.close();
  }

  close() {
    this._clearAutoTimer();
    this.panel.classList.add('hidden');
    this.progressBar.classList.add('hidden');
    if (this.resolveComplete) {
      this.resolveComplete();
      this.resolveComplete = null;
    }
  }
}
