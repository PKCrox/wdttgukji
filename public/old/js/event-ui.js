// EventUI — 이벤트 모달: 서사 텍스트 + 선택지 버튼

import {
  buildEventDirectorPacket,
  getBattlefieldSessionLines,
} from './turn-director.js';

export class EventUI {
  constructor() {
    this.modal = document.getElementById('event-modal');
    this.kicker = document.getElementById('event-kicker');
    this.title = document.getElementById('event-title');
    this.narrative = document.getElementById('event-narrative');
    this.flavor = document.getElementById('event-flavor');
    this.directorBrief = document.getElementById('event-director-brief');
    this.directorSummary = document.getElementById('event-director-summary');
    this.directorStakes = document.getElementById('event-director-stakes');
    this.choicesContainer = document.getElementById('event-choices');
    this.continueBtn = document.getElementById('event-continue');
    this._resolve = null;
  }

  _firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && `${value}`.trim() !== '');
  }

  _pickDecisionTrack(source = {}) {
    if (Array.isArray(source?.decisionTrack) && source.decisionTrack.length > 0) {
      return source.decisionTrack.slice(0, 5);
    }

    if (Array.isArray(source?.decisionPulse) && source.decisionPulse.length > 0) {
      return source.decisionPulse.slice(0, 5);
    }

    return [];
  }

  _pickDecisionFrame(director = {}) {
    return director.decisionSurface
      || director.sessionTrace
      || director.decisionFrame
      || director.battlefieldSession
      || director
      || {};
  }

  _buildDecisionSurfaceLines(director = {}) {
    return getBattlefieldSessionLines(director, 5);
  }

  _buildDecisionPulseLines(director) {
    const tracked = this._pickDecisionTrack(director);
    if (tracked.length > 0) return tracked;
    return this._buildDecisionSurfaceLines(director);
  }

  _uniqueLines(lines = []) {
    const seen = new Set();
    return lines
      .map((line) => `${line || ''}`.trim())
      .filter((line) => {
        if (!line || seen.has(line)) return false;
        seen.add(line);
        return true;
      });
  }

  _buildPrimaryDecisionLines(director = {}, maxLines = 2) {
    const lines = this._buildDecisionSurfaceLines(director);
    const city = this._pickDecisionValue(lines, '선택 도시') || '전장 전체';
    const nextAction = this._pickDecisionValue(lines, '다음 행동')
      || this._pickDecisionValue(lines, '다음 액션')
      || '다음 행동을 정렬합니다.';
    const mapReadout = this._pickDecisionValue(lines, '지도 판독');
    const frontline = this._pickDecisionValue(lines, '전선');
    const summary = [
      `선택 도시: ${this._truncateText(city, 24)}`,
      `다음 행동: ${this._truncateText(nextAction, 54)}`,
    ];
    if (maxLines > 2 && mapReadout) {
      summary.push(`지도 판독: ${this._truncateText(mapReadout, 54)}`);
    }
    if (maxLines > 3 && frontline) {
      summary.push(`전선: ${this._truncateText(frontline, 22)}`);
    }
    return this._uniqueLines(summary).slice(0, maxLines);
  }

  _pickDecisionValue(lines = [], label = '') {
    const match = Array.isArray(lines)
      ? lines.find((line) => `${line || ''}`.trim().startsWith(`${label}:`))
      : null;
    if (!match) return '';
    return `${match}`.replace(new RegExp(`^${label}:\\s*`, 'u'), '').trim();
  }

  _buildDecisionSurfaceSummary(director = {}, maxLines = 5) {
    const lines = this._buildDecisionSurfaceLines(director);
    const city = this._pickDecisionValue(lines, '선택 도시') || '전장 전체';
    const nextAction = this._pickDecisionValue(lines, '다음 행동') || '다음 행동을 정렬합니다.';
    const mapReadout = this._pickDecisionValue(lines, '지도 판독') || '지도 판독을 기준으로 판단을 정렬합니다.';
    const frontline = this._pickDecisionValue(lines, '전선') || '판독 대기';
    const scene = this._pickDecisionValue(lines, '장면') || '전장 정렬';

    return [
      `선택 도시: ${this._truncateText(city, 24)}`,
      `다음 행동: ${this._truncateText(nextAction, 54)}`,
      `지도 판독: ${this._truncateText(mapReadout, 54)}`,
      `전선: ${this._truncateText(frontline, 22)}`,
      `장면: ${this._truncateText(scene, 24)}`,
    ].slice(0, maxLines);
  }

  _buildChoiceSurfaceSummary(choiceDirector = {}, fallbackDirector = null, maxLines = 3) {
    const source = choiceDirector?.decisionSurface
      || choiceDirector?.sessionTrace
      || choiceDirector?.decisionFrame
      || choiceDirector
      || fallbackDirector
      || {};
    return this._buildDecisionSurfaceSummary(source, maxLines);
  }

  _truncateText(text, max = 58) {
    const value = `${text || ''}`.trim();
    if (!value) return '';
    if (value.length <= max) return value;
    return `${value.slice(0, Math.max(20, max - 1)).trim()}…`;
  }

  _setTextLines(element, lines = []) {
    element.textContent = '';
    const safeLines = lines.filter(Boolean);
    safeLines.forEach((line, index) => {
      if (index > 0) {
        element.appendChild(document.createElement('br'));
      }
      element.appendChild(document.createTextNode(line));
    });
  }

  _buildChoiceMeta(choiceDirector, fallbackDirector = null) {
    const tracked = this._pickDecisionTrack(choiceDirector);
    if (tracked.length > 0) {
      return this._uniqueLines(tracked.slice(0, 3).map((entry) => `판정면 ${this._truncateText(entry, 34)}`));
    }

    const source = choiceDirector?.decisionSurface
      || choiceDirector?.sessionTrace
      || choiceDirector?.decisionFrame
      || choiceDirector
      || fallbackDirector
      || {};
    const surfaceLines = this._buildDecisionSurfaceLines(source);
    const surfaceFocus = Array.isArray(source?.battlefieldDecisionFocus) && source.battlefieldDecisionFocus.length > 0
      ? source.battlefieldDecisionFocus
      : this._buildPrimaryDecisionLines(source, 2);
    const city = this._firstDefined(
      choiceDirector?.decisionCity,
      source?.cityName,
      source?.focusCity,
      source?.decisionCity,
      source?.decisionSurface?.cityName,
      source?.city,
      surfaceFocus[0]?.replace(/^선택 도시:\s*/, '') || '전장 전체',
    );
    const nextAction = this._firstDefined(
      choiceDirector?.nextAction,
      ...surfaceFocus.filter((entry) => entry.startsWith('다음 행동:')).map((entry) => entry.replace(/^다음 행동:\s*/, '')),
      source?.nextAction,
    );
    const mapReadout = this._firstDefined(choiceDirector?.mapReadout, source?.mapReadout);
    const frontline = this._firstDefined(choiceDirector?.frontline, source?.frontline);
    const scene = this._firstDefined(choiceDirector?.scene, source?.scene, source?.focusScene);
    const tags = Array.isArray(source.tags) ? source.tags : [];
    const meta = [];
    if (city) meta.push(`도시 ${this._truncateText(city, 30)}`);
    if (nextAction) meta.push(`다음 ${this._truncateText(nextAction, 28)}`);
    if (mapReadout) meta.push(`판독 ${this._truncateText(mapReadout, 30)}`);
    if (frontline) meta.push(`전선 ${this._truncateText(frontline, 24)}`);
    if (scene) meta.push(`장면 ${this._truncateText(scene, 24)}`);
    if (tags.length) {
      const tagLine = tags
        .map((tag) => `${tag.label || '지표'}:${tag.value || tag}`)
        .join(' · ');
      meta.push(`지표 ${tagLine}`);
    }
    if (choiceDirector?.tone) {
      const toneMap = {
        advantage: '우세',
        cost: '대가',
        neutral: '균형',
      };
      meta.push(`관성 ${toneMap[choiceDirector.tone] || '확인'}`);
    }
    if (meta.length > 0) return meta;
    return this._uniqueLines(surfaceLines.slice(0, 4).map((line) => `판정면 ${this._truncateText(line, 34)}`));
  }

  // 이벤트를 표시하고 플레이어 선택을 기다림
  // 반환: 선택된 choiceId (선택지 없으면 null)
  show(event, state = null) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      const director = buildEventDirectorPacket({ event, state });
      const decisionTrack = this._buildDecisionPulseLines(director);
      const decisionSurface = Array.isArray(director.battlefieldDecisionFocus) && director.battlefieldDecisionFocus.length > 0
        ? director.battlefieldDecisionFocus
        : this._buildDecisionSurfaceLines(director);
      const decisionFocus = this._buildPrimaryDecisionLines(director, 2);
      const surfaceSummary = this._buildDecisionSurfaceSummary(director, 5);
      const compactStakes = director.stakes || surfaceSummary.join(' · ') || decisionTrack.join(' · ');

      const narrativeText = event.narrative?.text || '';

      this.kicker.textContent = director.kicker || '정세 보고';
      this.title.textContent = director.headline || event.name || '정세 변화';
      this.narrative.textContent = narrativeText;

      if (director.flavor || event.narrative?.flavor) {
        this.flavor.textContent = director.flavor || event.narrative?.flavor;
        this.flavor.classList.remove('hidden');
      } else {
        this.flavor.classList.add('hidden');
      }

      if (
        director.summary
        || director.stakes
        || decisionTrack.length > 0
        || decisionSurface.length > 0
      ) {
        const summaryLines = this._uniqueLines([
          director.summary || decisionFocus[0] || '사건 판독을 한 세션으로 정렬합니다.',
          ...decisionFocus.slice(1),
        ]);
        this._setTextLines(this.directorSummary, summaryLines);
        const stakesLines = this._uniqueLines([
          ...decisionFocus,
          compactStakes ? `판단 근거: ${this._truncateText(compactStakes, 80)}` : '',
        ]).filter(Boolean);
        this._setTextLines(this.directorStakes, stakesLines);
        this.directorBrief.classList.remove('hidden');
      } else {
        this.directorBrief.classList.add('hidden');
      }

      // 선택지
      this.choicesContainer.innerHTML = '';
      if (event.choices && event.choices.length > 0) {
        this.continueBtn.classList.add('hidden');
        for (const choice of event.choices) {
          const choiceDirector = director.choices?.find((item) => item.id === choice.id);
          const choiceMeta = this._buildChoiceMeta(choiceDirector, director);
          const fallbackMeta = choiceMeta.length > 0
            ? choiceMeta
            : this._buildChoiceSurfaceSummary(choiceDirector, director, 3);
          const btn = document.createElement('button');
          const isRecommended = choiceDirector?.id && choiceDirector.id === director.recommendedChoiceId;
          btn.className = `choice-btn${isRecommended ? ' recommended' : ''}`;
          btn.innerHTML = `
            <span class="choice-btn-head">
              <span class="choice-btn-title">${choice.text}</span>
              ${isRecommended ? '<span class="choice-btn-badge">권고</span>' : ''}
            </span>
            ${choiceDirector?.impact?.length ? `<span class="choice-btn-impact">${choiceDirector.impact.join(' · ')}</span>` : ''}
            ${fallbackMeta.length ? `<span class="choice-btn-meta">판정면: ${fallbackMeta.join(' · ')}</span>` : ''}
            ${choiceDirector?.rationale ? `<span class="choice-btn-rationale">${choiceDirector.rationale}</span>` : ''}
          `;
          btn.addEventListener('click', () => this._select(choice.id));
          this.choicesContainer.appendChild(btn);
        }
      } else {
        // 선택지 없으면 "계속" 버튼
        this.continueBtn.classList.remove('hidden');
        this.continueBtn.textContent = director.continueLabel || '보고 접수';
        this.continueBtn.onclick = () => this._select(null);
      }

      this.modal.classList.remove('hidden');
    });
  }

  _select(choiceId) {
    this.modal.classList.add('hidden');
    if (this._resolve) {
      this._resolve(choiceId);
      this._resolve = null;
    }
  }

  hide() {
    this.modal.classList.add('hidden');
  }
}
