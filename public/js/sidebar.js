// Sidebar — 도시 정보, 세력 요약, 캐릭터 상세

import { getCharName, getSkillName, getItemName } from '../../engine/data/names.js';
import { SKILLS } from '../../engine/core/skills.js';
import { ITEMS } from '../../engine/core/items.js';
import { getGrowthInfo } from '../../engine/core/growth.js';

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
    this.factionList = document.getElementById('faction-list');
    this.onCharacterClick = null;
  }

  updateFactionSummary(state) {
    this.factionList.innerHTML = '';
    const factions = Object.entries(state.factions)
      .filter(([, f]) => f.active)
      .sort((a, b) => {
        const citiesA = state.getCitiesOfFaction(a[0]).length;
        const citiesB = state.getCitiesOfFaction(b[0]).length;
        return citiesB - citiesA;
      });

    for (const [fId, faction] of factions) {
      const cities = state.getCitiesOfFaction(fId);
      const army = state.getTotalArmy(fId);
      const chars = state.getCharactersOfFaction(fId);
      const color = FACTION_COLORS[fId] || '#666';
      const rep = faction.reputation || 100;

      const div = document.createElement('div');
      div.className = 'faction-item';
      div.innerHTML = `
        <div class="faction-info">
          <span class="faction-dot" style="background:${color}"></span>
          <span>${faction.name}</span>
          <span class="faction-rep" title="평판">☆${rep}</span>
        </div>
        <span class="faction-meta">${cities.length}성 ${formatArmy(army)} ${chars.length}장</span>
      `;
      this.factionList.appendChild(div);
    }
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

    let html = `<div class="city-detail">
      <div class="city-name">${city.name}</div>
      <span class="city-owner" style="background:${color}">${faction ? faction.name : '무주지'}</span>
      <span style="color:var(--text-dim);font-size:0.8rem;margin-left:0.4rem">태수: ${governorName}</span>

      <div class="stat-grid" style="margin-top:0.75rem">
        <div class="stat-row"><span class="stat-label">병력</span><span class="stat-value">${city.army.toLocaleString()}</span></div>
        <div class="stat-row"><span class="stat-label">사기</span><span class="stat-value">${city.morale}</span></div>
        <div class="stat-row"><span class="stat-label">인구</span><span class="stat-value">${city.population.toLocaleString()}</span></div>
        <div class="stat-row"><span class="stat-label">방어</span><span class="stat-value">${city.defense}</span></div>
        <div class="stat-row"><span class="stat-label">식량</span><span class="stat-value">${city.food.toLocaleString()}</span></div>
      </div>

      <div class="domestic-tracks" style="margin-top:0.6rem">
        <h4 style="font-size:0.75rem;color:var(--accent);margin-bottom:0.3rem">내정</h4>`;

    // 4트랙 바
    for (const [key, label] of Object.entries(TRACK_LABELS)) {
      const val = city[key] || 0;
      const trackColor = TRACK_COLORS[key];
      const bonus = city.naturalBonus?.[key];
      const bonusText = bonus ? ` (×${bonus})` : '';
      html += `
        <div class="domestic-bar">
          <span class="track-label">${label}${bonusText}</span>
          <div class="bar-track small"><div class="bar-fill" style="width:${val}%;background:${trackColor}"></div></div>
          <span class="track-num">${val}</span>
        </div>`;
    }

    html += `</div>`;

    // 장수 목록
    if (characters.length > 0) {
      html += `<div class="char-list"><h4 style="font-size:0.8rem;color:var(--accent);margin-bottom:0.4rem">장수 (${characters.length}명)</h4>`;
      for (const char of characters.sort((a, b) => {
        const totalA = Object.values(a.stats).reduce((s, v) => s + v, 0);
        const totalB = Object.values(b.stats).reduce((s, v) => s + v, 0);
        return totalB - totalA;
      })) {
        const total = Object.values(char.stats).reduce((s, v) => s + v, 0);
        const isGovernor = char.id === city.governor;
        const isLeader = char.id === faction?.leader;
        const badge = isLeader ? ' ★' : isGovernor ? ' ◆' : '';
        html += `<div class="char-item" data-char-id="${char.id}">
          <span>${getCharName(char.id)}${badge}</span>
          <span class="char-stats-mini">
            통${char.stats.command} 무${char.stats.war} 지${char.stats.intellect} 정${char.stats.politics} 매${char.stats.charisma} (${total})
          </span>
        </div>`;
      }
      html += '</div>';
    }

    // 포로
    if (captives.length > 0) {
      html += `<div class="char-list"><h4 style="font-size:0.8rem;color:#E74C3C;margin-bottom:0.4rem">포로 (${captives.length}명)</h4>`;
      for (const cap of captives) {
        const total = Object.values(cap.stats).reduce((s, v) => s + v, 0);
        html += `<div class="char-item captive" data-char-id="${cap.id}">
          <span>⛓ ${getCharName(cap.id)}</span>
          <span class="char-stats-mini">(${total}) 감금 ${cap.turnsInCaptivity || 0}턴</span>
        </div>`;
      }
      html += '</div>';
    }

    // 방랑 인재 (힌트)
    if (wanderers.length > 0) {
      html += `<div style="margin-top:0.5rem;font-size:0.75rem;color:var(--text-dim)">💡 이 지역에 방랑 인재 ${wanderers.length}명 감지</div>`;
    }

    html += '</div>';
    this.cityInfo.innerHTML = html;

    // 캐릭터 클릭 이벤트
    this.cityInfo.querySelectorAll('.char-item').forEach(el => {
      el.addEventListener('click', () => {
        const charId = el.dataset.charId;
        if (this.onCharacterClick) this.onCharacterClick(charId);
      });
    });
  }

  clearCityDetail() {
    this.cityInfo.innerHTML = `<h3>도시를 선택하세요</h3><p class="hint">맵에서 도시를 클릭하면 상세 정보가 표시됩니다</p>`;
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
