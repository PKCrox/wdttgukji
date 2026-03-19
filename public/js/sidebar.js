// Sidebar — 도시 정보, 세력 요약, 캐릭터 상세

import { getCharName, getSkillName, getItemName } from '../../engine/data/names.js';
import { SKILLS } from '../../engine/core/skills.js';
import { ITEMS } from '../../engine/core/items.js';
import { getGrowthInfo } from '../../engine/core/growth.js';
import { getCityForecast, getCityPolicy } from '../../engine/core/domestic.js';
import { getFactionSealLabel } from './presentation-meta.js';

const FACTION_COLORS = {
  wei: '#4A90D9',
  shu: '#2ECC71',
  wu: '#E74C3C',
  liu_zhang: '#F39C12',
  zhang_lu: '#9B59B6'
};

const STAT_LABELS = {
  command: '통솔',
  war: '무력',
  intellect: '지력',
  politics: '정치',
  charisma: '매력'
};

const STAT_COLORS = {
  command: '#4A90D9',
  war: '#E74C3C',
  intellect: '#9B59B6',
  politics: '#2ECC71',
  charisma: '#F39C12'
};

const REL_TYPE_NAMES = {
  sworn_brothers: '결의형제',
  mentor_student: '사제',
  lord_vassal: '군신',
  rivalry: '라이벌',
  loyalty: '충성',
  respect: '존경',
  friendship: '우정',
  enmity: '원한',
  family: '혈연',
  alliance: '동맹',
  neutral: '중립'
};

const TRACK_LABELS = {
  agriculture: '농업',
  commerce: '상업',
  technology: '기술',
  publicOrder: '치안'
};

const TRACK_COLORS = {
  agriculture: '#2ECC71',
  commerce: '#F39C12',
  technology: '#4A90D9',
  publicOrder: '#E74C3C'
};

export class Sidebar {
  constructor() {
    this.cityInfo = document.getElementById('city-info');
    this.commandButton = document.getElementById('btn-open-command-rail');
    this.onCharacterClick = null;
    this.onOpenCommand = null;
    this.openingBrief = [];
    this.commandButton?.addEventListener('click', () => {
      if (this.commandButton.disabled) return;
      if (this.onOpenCommand) this.onOpenCommand();
    });
  }

  showCityDetail(cityId, state) {
    const city = state.cities[cityId];
    if (!city) return;

    const faction = city.owner ? state.factions[city.owner] : null;
    const color = FACTION_COLORS[city.owner] || '#666';
    const characters = state.getCharactersInCity(cityId);
    const captives = state.getCaptivesInCity ? state.getCaptivesInCity(cityId) : [];
    const wanderers = state.getWanderingInCity ? state.getWanderingInCity(cityId) : [];
    const governor = city.governor ? state.getCharacter(city.governor) : null;
    const governorName = governor ? getCharName(city.governor) : '없음';
    const forecast = getCityForecast(cityId, state);
    const policy = getCityPolicy(city);
    const seal = getFactionSealLabel(city.owner);

    let html = `<div class="city-dossier">
      <section class="city-dossier-hero">
        <div class="city-dossier-seal" style="--seal-color:${color}">${seal}</div>
        <div class="city-dossier-head">
          <div class="city-panel-title">도시 도감</div>
          <div class="city-name">${city.name}</div>
          <div class="city-governor-line">${faction ? faction.name : '무주지'} · 태수 ${governorName}</div>
          <div class="city-dossier-note">${forecast.recommendations[0] || '이번 달 전황과 월간 예측을 함께 보십시오.'}</div>
          <div class="city-dossier-note">시정 ${policy.domestic.name} · 군령 ${policy.military.name}</div>
        </div>
      </section>

      <section class="city-stat-strip">
        <div class="city-metric"><span class="city-metric-label">병력</span><span class="city-metric-value">${formatMetric(city.army, true)}</span></div>
        <div class="city-metric"><span class="city-metric-label">사기</span><span class="city-metric-value">${formatMetric(city.morale)}</span></div>
        <div class="city-metric"><span class="city-metric-label">인구</span><span class="city-metric-value">${formatMetric(city.population, true)}</span></div>
        <div class="city-metric"><span class="city-metric-label">방어</span><span class="city-metric-value">${formatMetric(city.defense)}</span></div>
        <div class="city-metric"><span class="city-metric-label">식량</span><span class="city-metric-value">${formatMetric(city.food, true)}</span></div>
        <div class="city-metric"><span class="city-metric-label">주둔 장수</span><span class="city-metric-value">${characters.length}명</span></div>
      </section>

      <section class="city-ledger-board">
        <div class="ledger-board-head">
          <div class="ledger-kicker">도시 장부</div>
          <h4>4개 성장축</h4>
        </div>
        <div class="ledger-track-grid">`;

    for (const [key, label] of Object.entries(TRACK_LABELS)) {
      const val = city[key] || 0;
      const trackColor = TRACK_COLORS[key];
      const bonus = city.naturalBonus?.[key];
      html += `
          <div class="ledger-track-card">
            <div class="ledger-track-top">
              <span class="track-label">${label}</span>
              <span class="track-num">${val}</span>
            </div>
            <div class="bar-track small"><div class="bar-fill" style="width:${val}%;background:${trackColor}"></div></div>
            <div class="ledger-track-note">${bonus ? `자연 보너스 ×${bonus}` : '기본 성장축'}</div>
          </div>`;
    }

    html += `
        </div>
      </section>

      <section class="city-forecast-ledger">
        <div class="ledger-board-head">
          <div class="ledger-kicker">월간 예측</div>
          <h4>다음 턴 전망</h4>
        </div>
        <div class="forecast-grid">
          <div>금 <strong>${signed(forecast.goldDelta)}</strong></div>
          <div>식량 <strong>${signed(forecast.foodDelta)}</strong></div>
          <div>인구 <strong>${signed(forecast.popDelta)}</strong></div>
          <div>사기 <strong>${signed(forecast.moraleDelta)}</strong></div>
          <div>치안 <strong>${signed(forecast.orderDelta)}</strong></div>
        </div>
        ${forecast.risks.length > 0 ? `<div class="forecast-risks">위험: ${forecast.risks.join(' · ')}</div>` : ''}
        ${forecast.bonuses.length > 0 ? `<div class="forecast-bonuses">보너스: ${forecast.bonuses.slice(0, 3).join(' · ')}</div>` : ''}
        ${forecast.recommendations.length > 0 ? `<div class="forecast-recommend">추천: ${forecast.recommendations.join(' / ')}</div>` : ''}
      </section>
    `;

    html += renderRecommendationCard(getCityRecommendations(city, state, forecast));

    if (characters.length > 0) {
      html += `<section class="garrison-board">
        <div class="ledger-board-head">
          <div class="ledger-kicker">주둔 장수</div>
          <h4>${characters.length}명</h4>
        </div>
        <div class="garrison-list">`;
      for (const char of characters.sort((a, b) => totalStats(b.stats) - totalStats(a.stats))) {
        const total = totalStats(char.stats);
        const isGovernor = char.id === city.governor;
        const isLeader = char.id === faction?.leader;
        const badge = isLeader ? '군주' : isGovernor ? '태수' : '장수';
        html += `<button class="garrison-card char-item" data-char-id="${char.id}">
          <div class="garrison-card-top">
            <span>${getCharName(char.id)}</span>
            <span class="garrison-role">${badge}</span>
          </div>
          <div class="char-stats-mini">통${char.stats.command} 무${char.stats.war} 지${char.stats.intellect} 정${char.stats.politics} 매${char.stats.charisma} (${total})</div>
        </button>`;
      }
      html += `</div></section>`;
    }

    if (captives.length > 0) {
      html += `<section class="garrison-board captive-board">
        <div class="ledger-board-head">
          <div class="ledger-kicker">포로 장부</div>
          <h4>${captives.length}명</h4>
        </div>
        <div class="garrison-list">`;
      for (const captive of captives) {
        html += `<button class="garrison-card char-item captive" data-char-id="${captive.id}">
          <div class="garrison-card-top">
            <span>⛓ ${getCharName(captive.id)}</span>
            <span class="garrison-role">포로</span>
          </div>
          <div class="char-stats-mini">총합 ${totalStats(captive.stats)} · 감금 ${captive.turnsInCaptivity || 0}턴</div>
        </button>`;
      }
      html += `</div></section>`;
    }

    if (wanderers.length > 0) {
      html += `<section class="overview-card rumor-board"><div class="overview-title">인재 소문</div><div class="overview-copy">이 지역에 방랑 인재 ${wanderers.length}명이 감지됩니다. 인사 장면에서 탐색을 검토하십시오.</div></section>`;
    }

    html += `</div>`;
    this.cityInfo.innerHTML = html;
    this._setCommandButton(city);

    // 캐릭터 클릭 이벤트
    this.cityInfo.querySelectorAll('.char-item').forEach(el => {
      el.addEventListener('click', () => {
        const charId = el.dataset.charId;
        if (this.onCharacterClick) this.onCharacterClick(charId);
      });
    });
  }

  showOverview(state) {
    const faction = state.getFaction(state.player.factionId);
    const tactician = state.getTactician?.(state.player.factionId);
    const priorityCities = getPriorityCities(state);
    const recommendations = getPlayerRecommendations(state);
    const color = FACTION_COLORS[state.player.factionId] || '#666';
    const seal = getFactionSealLabel(state.player.factionId);

    this.cityInfo.innerHTML = `
      <div class="city-rail-empty city-overview-dossier">
        <section class="city-dossier-hero">
          <div class="city-dossier-seal" style="--seal-color:${color}">${seal}</div>
          <div class="city-dossier-head">
            <div class="city-panel-title">작전 본부</div>
            <div class="city-name">${faction?.name || '세력'} 현황</div>
            <div class="city-governor-line">도시를 선택하면 상세 장부와 명령 장면이 열립니다.${tactician ? ` · 책사 ${getCharName(tactician.id)}` : ''}</div>
            <div class="city-dossier-note">${recommendations[0] || '첫 명령을 정해 판세를 굴리십시오.'}</div>
          </div>
        </section>
        ${renderBriefBox(this.openingBrief, recommendations)}
        <section class="overview-card">
          <div class="overview-title">전선 추천 도시</div>
          <div class="overview-grid">
            <div class="overview-list">
              ${priorityCities.map(({ city, reason }) => `
                <div class="overview-item">
                  <div class="overview-item-title">${city.name}</div>
                  <div class="overview-item-meta">${reason}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>
      </div>
    `;
    this._setCommandButton(null);
  }

  clearCityDetail(state) {
    if (state) {
      this.showOverview(state);
      return;
    }
    this.cityInfo.innerHTML = `<div class="city-rail-empty"><div class="overview-card"><div class="overview-title">도시를 선택하세요</div><div class="overview-copy">맵에서 도시를 클릭하면 상세 정보가 표시됩니다.</div></div></div>`;
    this._setCommandButton(null);
  }

  setOpeningBrief(lines) {
    this.openingBrief = Array.isArray(lines) ? lines : [];
  }

  _setCommandButton(city) {
    if (!this.commandButton) return;
    if (!city) {
      this.commandButton.disabled = true;
      this.commandButton.textContent = '명령 열기';
      return;
    }
    this.commandButton.disabled = false;
    this.commandButton.textContent = `${city.name} 작전 열기`;
  }
}

// --- 캐릭터 상세 모달 ---
export function showCharacterModal(charId, state) {
  const char = state.getCharacter(charId);
  if (!char) return;

  const modal = document.getElementById('char-modal');
  const content = document.getElementById('char-modal-content');
  const backdrop = document.getElementById('char-modal-backdrop');

  const faction = char.faction ? state.factions[char.faction] : null;
  const factionColor = FACTION_COLORS[char.faction] || '#666';

  // 상태 텍스트
  let statusText;
  switch (char.status) {
    case 'active': statusText = char.city ? state.cities[char.city]?.name || '' : '이동 중'; break;
    case 'captive': statusText = `포로 (${state.factions[char.capturedBy]?.name || '불명'})` ; break;
    case 'wandering': statusText = '방랑'; break;
    case 'dead': statusText = '사망'; break;
    default: statusText = char.alive ? '활동 중' : '사망';
  }

  // 관계 찾기
  const rels = (state.relationships || []).filter(
    r => r.a === charId || r.b === charId
  );

  let html = `
    <div class="char-header">
      <div class="char-name-block">
        <div class="char-detail-name">${getCharName(charId)}</div>
        <div class="char-detail-title">${statusText}</div>
      </div>
      ${faction ? `<span class="char-faction-badge" style="background:${factionColor}">${faction.name}</span>` : '<span class="char-faction-badge" style="background:#666">무소속</span>'}
    </div>

    <div class="char-loyalty">
      <span class="loyalty-label">충성도</span>
      <span class="loyalty-value" style="color:${loyaltyColor(char.loyalty)}">${char.loyalty}</span>
    </div>

    <div class="char-stats-section">
      <h4>능력치</h4>
      <div class="char-stat-bars">`;

  for (const [key, label] of Object.entries(STAT_LABELS)) {
    const val = char.stats[key] || 0;
    const color = STAT_COLORS[key];
    html += `
        <div class="char-stat-bar">
          <span class="stat-label">${label}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${val}%;background:${color}"></div></div>
          <span class="stat-num">${val}</span>
        </div>`;
  }

  const total = Object.values(char.stats).reduce((s, v) => s + v, 0);
  html += `
      </div>
      <div style="text-align:right;font-size:0.75rem;color:var(--text-dim);margin-top:0.3rem">총합 ${total}</div>
    </div>`;

  // 레벨/경험치
  const growth = getGrowthInfo(char);
  if (growth.level > 0) {
    html += `<div class="char-growth"><h4>성장</h4>
      <div style="font-size:0.8rem;color:var(--text-bright)">Lv.${growth.level} ${growth.nextLevelExp > 0 ? `(다음 레벨까지 ${growth.nextLevelExp} EXP)` : '(최대)'}</div>
    </div>`;
  }

  // 스킬
  if (char.skills && char.skills.length > 0) {
    html += `<div class="char-skills"><h4>특기</h4><div style="display:flex;flex-wrap:wrap;gap:0.3rem">`;
    for (const sId of char.skills) {
      const skill = SKILLS[sId];
      const name = getSkillName(sId);
      const typeColor = { combat: '#E74C3C', domestic: '#2ECC71', social: '#F39C12', espionage: '#9B59B6', support: '#4A90D9', tech: '#1ABC9C' }[skill?.type] || '#666';
      html += `<span class="skill-badge" style="border-color:${typeColor};color:${typeColor}" title="${skill?.desc || ''}">${name}</span>`;
    }
    html += `</div></div>`;
  }

  // 장비
  if (char.equipment) {
    const equipped = Object.entries(char.equipment).filter(([, v]) => v);
    if (equipped.length > 0) {
      html += `<div class="char-equipment"><h4>장비</h4>`;
      const slotNames = { weapon: '무기', armor: '갑옷', horse: '말', accessory: '보물' };
      for (const [slot, itemId] of equipped) {
        const item = ITEMS[itemId];
        const rColor = { legendary: '#FFD700', rare: '#9B59B6', common: '#95A5A6' }[item?.rarity] || '#666';
        html += `<div style="font-size:0.8rem;margin:0.15rem 0"><span style="color:var(--text-dim)">${slotNames[slot]}</span> <span style="color:${rColor}">${getItemName(itemId)}</span></div>`;
      }
      html += `</div>`;
    }
  }

  // 관계
  if (rels.length > 0) {
    html += `<div class="char-relationships"><h4>관계</h4>`;
    for (const rel of rels) {
      const otherId = rel.a === charId ? rel.b : rel.a;
      const otherName = getCharName(otherId);
      const typeName = REL_TYPE_NAMES[rel.type] || rel.type;
      const typeClass = rel.type.replace(/\s+/g, '_');
      html += `
        <div class="char-rel-item">
          <span>${otherName}</span>
          <span class="char-rel-type ${typeClass}">${typeName} ${rel.intensity}</span>
        </div>`;
    }
    html += '</div>';
  }

  html += `<button class="char-close-btn" id="char-close-btn">닫기</button>`;

  content.innerHTML = html;
  modal.classList.remove('hidden');

  const close = () => modal.classList.add('hidden');
  document.getElementById('char-close-btn').addEventListener('click', close);
  backdrop.addEventListener('click', close, { once: true });
}

function renderBriefBox(openingBrief, recommendations) {
  const blocks = [];
  if (openingBrief?.length) {
    blocks.push(`
      <div class="overview-card">
        <div class="brief-title">오프닝 목표</div>
        ${openingBrief.map(line => `<div class="brief-line">${line}</div>`).join('')}
      </div>
    `);
  }
  if (recommendations?.length) {
    blocks.push(`
      <div class="overview-card">
        <div class="brief-title">지금 추천</div>
        ${recommendations.map(line => `<div class="brief-line">${line}</div>`).join('')}
      </div>
    `);
  }
  return blocks.join('');
}

function renderRecommendationCard(lines) {
  if (!lines?.length) return '';
  return `
    <div class="overview-card">
      <div class="overview-title">추천 행동</div>
      <div class="overview-list">
        ${lines.map(line => `
          <div class="overview-item">
            <div class="overview-item-title">${line.title}</div>
            <div class="overview-item-meta">${line.detail}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function getPlayerRecommendations(state) {
  const factionId = state.player.factionId;
  const faction = state.getFaction(factionId);
  if (!faction) return [];

  const recs = [];
  const cities = state.getCitiesOfFaction(factionId);
  const strongest = [...cities].sort((a, b) => b.army - a.army)[0];

  if (!faction.research?.current && (faction.research?.completed?.length || 0) === 0) {
    recs.push('첫 연구를 시작해 장기 보너스를 확보');
  }

  const weakOrder = cities.find(city => (city.publicOrder || 0) < 45);
  if (weakOrder) {
    recs.push(`${weakOrder.name} 치안 보강으로 반란 위험 억제`);
  } else {
    const lowTech = cities.find(city => (city.technology || 0) < 45);
    if (lowTech) recs.push(`${lowTech.name} 기술 투자로 모집·방어 효율 확보`);
  }

  if (state.turn <= 6 && !state.factions[factionId].allies.length) {
    recs.push('오프닝 외교를 확인해 초반 전선 수를 줄이기');
  }

  if (strongest) {
    recs.push(`${strongest.name} 주력 병력과 식량 상태 점검`);
  }

  return recs.slice(0, 2);
}

function getPriorityCities(state) {
  const factionId = state.player.factionId;
  return state.getCitiesOfFaction(factionId)
    .map(city => {
      const forecast = getCityForecast(city.id, state);
      const pressure = city.army * 0.4 + city.defense * 250 + city.population * 0.03;
      const risk = (100 - (city.publicOrder || 0)) * 120 + Math.max(0, -forecast.foodDelta) * 0.6;
      return {
        city,
        score: pressure + risk,
        reason: `병력 ${city.army.toLocaleString()} · 치안 ${city.publicOrder || 0} · ${forecast.recommendations[0] || '전황 점검 필요'}`
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function getCityRecommendations(city, state, forecast) {
  const lines = [];
  if ((city.publicOrder || 0) < 50) {
    lines.push({
      title: '치안 정비',
      detail: `${city.name} 치안이 낮습니다. 공공질서 투자로 반란 위험을 먼저 눌러야 합니다.`
    });
  }
  if (forecast.foodDelta < 0) {
    lines.push({
      title: '농업 보강',
      detail: `다음 턴 식량이 ${signed(forecast.foodDelta)} 변동합니다. 농업 투자나 병력 조정이 필요합니다.`
    });
  }
  if ((city.technology || 0) < 55) {
    lines.push({
      title: '기술 투자',
      detail: `기술 수치 ${city.technology || 0}로 낮은 편입니다. 모집과 방어 효율을 끌어올릴 수 있습니다.`
    });
  }
  if ((city.defense || 0) < 65) {
    lines.push({
      title: '성방 보강',
      detail: `방어 ${city.defense}입니다. 전선 도시면 방어 강화나 건설을 우선하는 편이 안전합니다.`
    });
  }
  if (!lines.length) {
    lines.push({
      title: '안정 운영',
      detail: `${city.name}은 비교적 안정적입니다. 연구나 장기 성장 투자로 굴려도 됩니다.`
    });
  }
  return lines.slice(0, 2);
}

function signed(value) {
  return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
}

function formatMetric(value, comma = false) {
  if (!Number.isFinite(value)) return '—';
  return comma ? Math.round(value).toLocaleString() : Math.round(value);
}

function totalStats(stats) {
  return Object.values(stats || {}).reduce((sum, value) => sum + value, 0);
}

function loyaltyColor(loyalty) {
  if (loyalty >= 80) return '#2ECC71';
  if (loyalty >= 50) return '#F39C12';
  return '#E74C3C';
}

function formatArmy(n) {
  if (n >= 10000) return Math.floor(n / 10000) + '만';
  if (n >= 1000) return Math.floor(n / 1000) + '천';
  return n.toString();
}

export { getCharName, FACTION_COLORS, STAT_LABELS };
