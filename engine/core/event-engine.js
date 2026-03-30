// EventEngine — 트리거 평가(13종) + 효과 적용(16종)
// 순수 함수: 입력(이벤트, 상태) → 출력(새 상태, 로그)

import { getCharName, getFactionName, getStatName } from '../data/names.js';

function resolveRandom(options = {}) {
  return typeof options.random === 'function' ? options.random : Math.random;
}

// --- 트리거 평가 ---

const triggerEvaluators = {
  year_range(params, state) {
    return state.year >= params.min && state.year <= params.max;
  },

  character_alive(params, state) {
    return state.isAlive(params.character_id);
  },

  character_in_city(params, state) {
    const c = state.getCharacter(params.character_id);
    return c && c.alive && c.city === params.city;
  },

  character_stat_gte(params, state) {
    const c = state.getCharacter(params.character_id);
    if (!c || !c.alive) return false;
    return (c.stats[params.stat] || 0) >= params.value;
  },

  character_relationship(params, state) {
    const rel = state.getRelationship(params.a, params.b);
    if (!rel) return false;
    if (params.type && rel.type !== params.type) return false;
    if (params.min_intensity && rel.intensity < params.min_intensity) return false;
    return true;
  },

  faction_controls(params, state) {
    return state.factionControls(params.faction, params.territory);
  },

  faction_at_war(params, state) {
    return state.isAtWar(params.faction_a, params.faction_b);
  },

  faction_allied(params, state) {
    return state.isAllied(params.faction_a, params.faction_b);
  },

  resource_gte(params, state) {
    const faction = state.getFaction(params.faction);
    if (!faction) return false;
    if (params.resource === 'gold') return faction.gold >= params.value;
    // 도시 자원은 합산
    const total = state.getCitiesOfFaction(params.faction)
      .reduce((sum, c) => sum + (c[params.resource] || 0), 0);
    return total >= params.value;
  },

  resource_lte(params, state) {
    const faction = state.getFaction(params.faction);
    if (!faction) return false;
    if (params.resource === 'gold') return faction.gold <= params.value;
    const total = state.getCitiesOfFaction(params.faction)
      .reduce((sum, c) => sum + (c[params.resource] || 0), 0);
    return total <= params.value;
  },

  event_completed(params, state) {
    return state.firedEvents.includes(params.event_id);
  },

  event_not_completed(params, state) {
    return !state.firedEvents.includes(params.event_id);
  },

  random_chance(params, _state, options = {}) {
    return resolveRandom(options)() < (params.probability || 0.5);
  }
};

export function evaluateTrigger(event, state, options = {}) {
  if (!event.trigger || !event.trigger.conditions) return false;
  if (state.firedEvents.includes(event.id)) return false;

  // period.year 기반 자동 시기 필터 — year_range 조건이 없어도 적용
  // 이벤트의 역사적 시기와 현재 게임 연도가 ±2년 이내여야 발화
  if (event.period?.year) {
    const hasYearRange = event.trigger.conditions.some(c => c.type === 'year_range');
    if (!hasYearRange) {
      if (state.year < event.period.year - 2 || state.year > event.period.year + 5) {
        return false;
      }
    }
  }

  return event.trigger.conditions.every(cond => {
    const evaluator = triggerEvaluators[cond.type];
    if (!evaluator) {
      console.warn(`Unknown trigger type: ${cond.type}`);
      return false;
    }
    return evaluator(cond.params, state, options);
  });
}

// --- 효과 적용 ---

const effectAppliers = {
  stat_change(effect, state) {
    const c = state.getCharacter(effect.target);
    if (!c) return;
    const val = effect.value;
    const name = getCharName(effect.target);
    const statName = getStatName(val.stat);
    if (val.stat && val.delta != null) {
      c.stats[val.stat] = Math.max(0, Math.min(100, (c.stats[val.stat] || 0) + val.delta));
      state.log(`${name}의 ${statName} ${val.delta > 0 ? '+' : ''}${val.delta}`, 'effect');
    }
    if (val.stat && val.amount != null) {
      c.stats[val.stat] = Math.max(0, (c.stats[val.stat] || 0) + val.amount);
      state.log(`${name}의 ${statName} ${val.amount > 0 ? '+' : ''}${val.amount}`, 'effect');
    }
  },

  relationship_change(effect, state) {
    const val = effect.value;
    if (!val.with) return; // undefined 타겟 방어
    const rel = state.getRelationship(effect.target, val.with);
    if (rel) {
      rel.intensity = Math.max(0, Math.min(100, rel.intensity + (val.delta || 0)));
    } else {
      state.relationships.push({
        a: effect.target, b: val.with,
        type: val.type || 'neutral', intensity: Math.max(0, val.delta || 50)
      });
    }
    state.log(`${getCharName(effect.target)}와 ${getCharName(val.with)}의 관계가 변화`, 'effect');
  },

  loyalty_change(effect, state) {
    const c = state.getCharacter(effect.target);
    if (!c) return;
    const delta = typeof effect.value === 'number' ? effect.value : (effect.value.delta || 0);
    c.loyalty = Math.max(0, Math.min(100, c.loyalty + delta));
    state.log(`${getCharName(effect.target)}의 충성도 ${delta > 0 ? '+' : ''}${delta}`, 'effect');
  },

  resource_change(effect, state) {
    const val = effect.value;
    const faction = state.getFaction(effect.target);
    if (faction && val.resource === 'gold') {
      faction.gold = Math.max(0, faction.gold + (val.delta || 0));
      state.log(`${getFactionName(effect.target)}의 금 ${val.delta > 0 ? '+' : ''}${val.delta}`, 'effect');
      return;
    }
    // 도시 자원
    const cities = state.getCitiesOfFaction(effect.target);
    if (cities.length > 0 && val.resource) {
      const city = cities[0];
      const cityData = state.cities[city.id];
      if (cityData && val.resource in cityData) {
        cityData[val.resource] = Math.max(0, cityData[val.resource] + (val.delta || 0));
      }
    }
  },

  gold_change(effect, state) {
    const delta = typeof effect.value === 'number' ? effect.value : (effect.value?.delta || 0);
    const faction = state.getFaction(effect.target);
    if (!faction) return;
    faction.gold = Math.max(0, faction.gold + delta);
    state.log(`${getFactionName(effect.target)}의 금 ${delta > 0 ? '+' : ''}${delta}`, 'effect');
  },

  reputation_change(effect, state) {
    const delta = typeof effect.value === 'number' ? effect.value : (effect.value?.delta || 0);
    const faction = state.getFaction(effect.target);
    if (!faction) return;
    state._adjustReputation(effect.target, delta);
    state.log(`${getFactionName(effect.target)}의 평판 ${delta > 0 ? '+' : ''}${delta}`, 'effect');
  },

  territory_change(effect, state) {
    const val = effect.value;
    const city = state.cities[val.city];
    if (!city) return;
    if (val.action === 'gain' || val.action === 'capture') {
      const oldOwner = city.owner;
      // 플레이어 도시를 이벤트로 직접 빼앗는 것은 방지 → 피해만 적용
      if (oldOwner === state.player.factionId) {
        city.morale = Math.max(20, city.morale - 10);
        city.army = Math.max(1000, Math.floor(city.army * 0.85));
        state.log(`${city.name}이(가) 위협받고 있습니다! (병력 15% 손실, 사기 -10)`, 'warning');
        return; // 소유권 변경은 전투로만 가능
      }
      city.owner = effect.target;
      state.log(`${city.name}의 소유권이 ${oldOwner ? getFactionName(oldOwner) : '없음'} → ${getFactionName(effect.target)}(으)로 변경`, 'territory');
    } else if (val.action === 'contest') {
      state.log(`${city.name}이(가) 쟁탈 상태로 전환`, 'territory');
    }
  },

  army_change(effect, state) {
    const val = effect.value;
    const delta = val.delta || 0;
    // 세력의 전체 병력 변경 → 가장 큰 도시에서 차감/추가
    const cities = state.getCitiesOfFaction(effect.target);
    if (cities.length === 0) return;
    cities.sort((a, b) => b.army - a.army);
    const target = state.cities[cities[0].id];
    target.army = Math.max(0, target.army + delta);
    if (val.morale) {
      target.morale = Math.max(0, Math.min(100, target.morale + val.morale));
    }
    state.log(`${getFactionName(effect.target)}의 병력 ${delta > 0 ? '+' : ''}${delta}`, 'army');
  },

  character_join(effect, state) {
    const c = state.getCharacter(effect.target);
    if (!c) return;
    const val = effect.value;
    c.faction = val.faction || effect.target;
    if (val.city) c.city = val.city;
    state.log(`${getCharName(effect.target)}이(가) ${getFactionName(val.faction)}에 합류`, 'character');
  },

  character_leave(effect, state) {
    const c = state.getCharacter(effect.target);
    if (!c) return;
    c.faction = null;
    state.log(`${getCharName(effect.target)}이(가) 세력을 떠남`, 'character');
  },

  character_death(effect, state) {
    state.killCharacter(effect.target);
    const cause = effect.value?.cause || '사망';
    state.log(`${getCharName(effect.target)}이(가) ${cause}(으)로 사망`, 'death');
  },

  faction_war(effect, state) {
    state.declareWar(effect.target, effect.value);
    state.log(`${getFactionName(effect.target)}와 ${getFactionName(effect.value)} 사이에 전쟁 발발`, 'war');
  },

  faction_peace(effect, state) {
    state.makePeace(effect.target, effect.value);
    state.log(`${getFactionName(effect.target)}와 ${getFactionName(effect.value)} 사이에 화평 성립`, 'peace');
  },

  faction_alliance(effect, state) {
    state.makeAlliance(effect.target, effect.value);
    state.log(`${getFactionName(effect.target)}와 ${getFactionName(effect.value)}이(가) 동맹 체결`, 'alliance');
  },

  unlock_event(effect, state) {
    // 단순히 로그만 남김 — 실제 해금은 이벤트 자체 조건으로 관리
    state.log(`이벤트 해금: ${effect.value}`, 'unlock');
  },

  unlock_tech(effect, state) {
    const faction = state.getFaction(effect.target);
    if (faction) {
      faction.tech = Math.min(10, faction.tech + 1);
      state.log(`${getFactionName(effect.target)}의 기술 수준이 상승`, 'tech');
    }
  },

  custom(effect, state) {
    state.log(`커스텀 효과: ${JSON.stringify(effect.value)}`, 'custom');
  }
};

export function applyEffects(effects, state) {
  if (!effects || !Array.isArray(effects)) return;
  for (const effect of effects) {
    const applier = effectAppliers[effect.type];
    if (applier) {
      applier(effect, state);
    } else {
      console.warn(`Unknown effect type: ${effect.type}`);
    }
  }
}

// --- 이벤트 체크: 발화 가능한 이벤트 목록 반환 ---

export function checkEvents(events, state, options = {}) {
  const mode = state.narrativeMode || 'both';
  const triggered = [];
  for (const event of events) {
    // 정사/연의 모드 필터
    if (mode !== 'both' && event.mode && event.mode !== 'both' && event.mode !== mode) continue;
    if (evaluateTrigger(event, state, options)) {
      triggered.push(event);
    }
  }
  // 우선순위 내림차순 정렬
  triggered.sort((a, b) => (b.trigger.priority || 50) - (a.trigger.priority || 50));
  return triggered;
}

// --- 이벤트가 플레이어 관련인지 판단 ---

export function isPlayerEvent(event, state) {
  if (!event.participants) return false;
  const playerFaction = state.player.factionId;
  const playerChar = state.player.characterId;

  return event.participants.some(p => {
    const c = state.getCharacter(p.character_id);
    return p.character_id === playerChar || (c && c.faction === playerFaction);
  });
}
