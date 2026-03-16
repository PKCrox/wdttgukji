// Items — 장비/보물 시스템
//
// 장수 장착: char.equipment = { weapon, armor, horse, accessory } (슬롯당 1개, null=빈칸)
// 미장착 아이템: faction.inventory = ['item_id', ...]
// 장비 효과: 능력치 가산 (전투력/방어 등에 자동 반영)

// ─── 아이템 정의 ───

export const ITEMS = {
  // ── 무기 ──
  green_dragon: {
    id: 'green_dragon',
    name: '청룡언월도',
    type: 'weapon',
    rarity: 'legendary',
    effects: { war: 10 },
    desc: '관우의 상징. 82근의 언월도로 적장을 베다'
  },
  serpent_spear: {
    id: 'serpent_spear',
    name: '장팔사모',
    type: 'weapon',
    rarity: 'legendary',
    effects: { war: 8 },
    desc: '장비의 사모. 1장 8척에 달하는 긴 창'
  },
  sky_piercer: {
    id: 'sky_piercer',
    name: '방천화극',
    type: 'weapon',
    rarity: 'legendary',
    effects: { war: 12 },
    desc: '여포의 극. 하늘을 찌르는 무인 최강의 무기'
  },
  paired_swords: {
    id: 'paired_swords',
    name: '자웅쌍검',
    type: 'weapon',
    rarity: 'rare',
    effects: { war: 5, command: 3 },
    desc: '유비의 한 쌍 검. 자웅을 갈라 양손에 쥐다'
  },
  heaven_sword: {
    id: 'heaven_sword',
    name: '의천검',
    type: 'weapon',
    rarity: 'rare',
    effects: { war: 7 },
    desc: '조조의 보검. 천하를 평정할 의지를 담은 검'
  },
  ancient_blade: {
    id: 'ancient_blade',
    name: '고정도',
    type: 'weapon',
    rarity: 'rare',
    effects: { war: 6 },
    desc: '명장들이 즐겨 사용한 전통 장도'
  },
  seven_star: {
    id: 'seven_star',
    name: '칠성검',
    type: 'weapon',
    rarity: 'rare',
    effects: { war: 4, intellect: 3 },
    desc: '북두칠성을 새긴 보검. 지략가의 호신 검'
  },

  // ── 갑옷 ──
  silver_armor: {
    id: 'silver_armor',
    name: '백은갑',
    type: 'armor',
    rarity: 'legendary',
    effects: { defense_bonus: 10 },
    desc: '은백색으로 빛나는 명갑. 화살을 튕겨낸다'
  },
  bright_armor: {
    id: 'bright_armor',
    name: '명광갑',
    type: 'armor',
    rarity: 'rare',
    effects: { defense_bonus: 8 },
    desc: '빛을 반사하는 갑주. 전장에서 적의 눈을 현혹한다'
  },

  // ── 말 ──
  red_hare: {
    id: 'red_hare',
    name: '적토마',
    type: 'horse',
    rarity: 'legendary',
    effects: { war: 5, command: 3 },
    desc: '하루에 천 리를 달리는 적색 명마. 여포→관우'
  },
  hex_mark: {
    id: 'hex_mark',
    name: '적로마',
    type: 'horse',
    rarity: 'rare',
    effects: { war: 3, command: 2 },
    desc: '유비의 명마. 단계를 뛰어넘어 주인을 살리다'
  },
  shadow: {
    id: 'shadow',
    name: '절영',
    type: 'horse',
    rarity: 'rare',
    effects: { war: 3 },
    desc: '조조의 명마. 그림자도 밟지 못할 만큼 빠르다'
  },
  golden_claw: {
    id: 'golden_claw',
    name: '조황비전',
    type: 'horse',
    rarity: 'rare',
    effects: { war: 2, command: 2 },
    desc: '황금빛 갈기의 명마. 번개처럼 돌진한다'
  },

  // ── 서적/보물 ──
  mengde_book: {
    id: 'mengde_book',
    name: '맹덕신서',
    type: 'book',
    rarity: 'legendary',
    effects: { intellect: 8 },
    desc: '조조가 저술한 병서. 군략의 정수를 담다'
  },
  art_of_war: {
    id: 'art_of_war',
    name: '손자병법',
    type: 'book',
    rarity: 'legendary',
    effects: { intellect: 10, command: 5 },
    desc: '전쟁의 바이블. 읽는 자에게 천하의 이치를 열다'
  },
  taiping_book: {
    id: 'taiping_book',
    name: '태평요술',
    type: 'book',
    rarity: 'legendary',
    effects: { intellect: 5, charisma: 5 },
    desc: '장각이 얻은 도술서. 민심을 움직이는 힘'
  },
  imperial_seal: {
    id: 'imperial_seal',
    name: '전국옥새',
    type: 'treasure',
    rarity: 'legendary',
    effects: { charisma: 10, politics: 5 },
    desc: '천자의 옥새. 소유자에게 정통성과 위엄을 부여한다'
  },
  formation_map: {
    id: 'formation_map',
    name: '24진도',
    type: 'book',
    rarity: 'rare',
    effects: { command: 8 },
    desc: '24가지 진법을 정리한 진형도. 통솔의 극의'
  }
};

// ─── 유틸 ───

/**
 * 아이템 효과가 적용된 최종 능력치를 계산
 *
 * @param {object} char - 캐릭터 객체 (char.stats, char.equipment)
 * @returns {object} { command, war, intellect, politics, charisma, defense_bonus } 장비 보너스 합산 스탯
 *
 * @example
 * const effective = getEffectiveStats(guanYu);
 * // guanYu.stats.war=97, 청룡언월도(+10), 적토마(+5) → effective.war = 112
 */
export function getEffectiveStats(char) {
  const base = { ...char.stats };
  if (!char.equipment) return base;

  // defense_bonus는 스탯이 아닌 추가 필드
  let defenseBonus = 0;

  for (const slot of ['weapon', 'armor', 'horse', 'accessory']) {
    const itemId = char.equipment[slot];
    if (!itemId) continue;

    const item = ITEMS[itemId];
    if (!item) continue;

    for (const [stat, bonus] of Object.entries(item.effects)) {
      if (stat === 'defense_bonus') {
        defenseBonus += bonus;
      } else if (base[stat] != null) {
        base[stat] += bonus;
      }
    }
  }

  base.defense_bonus = defenseBonus;
  return base;
}

/**
 * 아이템을 캐릭터에게 장착
 *
 * @param {object} state - GameState
 * @param {string} charId - 장착할 캐릭터 ID
 * @param {string} itemId - 장착할 아이템 ID
 * @returns {{ success: boolean, unequipped: string|null, reason: string }}
 */
export function equipItem(state, charId, itemId) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive || char.status !== 'active') {
    return { success: false, unequipped: null, reason: 'invalid_character' };
  }

  const item = ITEMS[itemId];
  if (!item) {
    return { success: false, unequipped: null, reason: 'invalid_item' };
  }

  const faction = state.getFaction(char.faction);
  if (!faction) {
    return { success: false, unequipped: null, reason: 'no_faction' };
  }

  // 인벤토리에 아이템이 있는지 확인
  if (!faction.inventory || !faction.inventory.includes(itemId)) {
    return { success: false, unequipped: null, reason: 'not_in_inventory' };
  }

  // 슬롯 결정 (book/treasure → accessory 슬롯)
  const slot = (item.type === 'book' || item.type === 'treasure') ? 'accessory' : item.type;

  // 장비 슬롯 초기화
  if (!char.equipment) {
    char.equipment = { weapon: null, armor: null, horse: null, accessory: null };
  }

  // 기존 장비 해제 → 인벤토리로
  const unequipped = char.equipment[slot] || null;
  if (unequipped) {
    faction.inventory.push(unequipped);
  }

  // 장착
  char.equipment[slot] = itemId;
  faction.inventory = faction.inventory.filter(id => id !== itemId);

  return { success: true, unequipped, reason: 'equipped' };
}

/**
 * 캐릭터의 장비를 해제하여 세력 인벤토리로 반환
 *
 * @param {object} state - GameState
 * @param {string} charId - 캐릭터 ID
 * @param {'weapon'|'armor'|'horse'|'accessory'} slot - 해제할 슬롯
 * @returns {{ success: boolean, itemId: string|null, reason: string }}
 */
export function unequipItem(state, charId, slot) {
  const char = state.getCharacter(charId);
  if (!char || !char.alive) {
    return { success: false, itemId: null, reason: 'invalid_character' };
  }

  if (!char.equipment || !char.equipment[slot]) {
    return { success: false, itemId: null, reason: 'slot_empty' };
  }

  const faction = state.getFaction(char.faction);
  if (!faction) {
    return { success: false, itemId: null, reason: 'no_faction' };
  }

  const itemId = char.equipment[slot];
  char.equipment[slot] = null;

  if (!faction.inventory) faction.inventory = [];
  faction.inventory.push(itemId);

  return { success: true, itemId, reason: 'unequipped' };
}

/**
 * 특정 타입의 아이템 목록 조회
 *
 * @param {'weapon'|'armor'|'horse'|'book'|'treasure'} type
 * @returns {object[]}
 */
export function getItemsByType(type) {
  return Object.values(ITEMS).filter(i => i.type === type);
}

/**
 * 특정 등급의 아이템 목록 조회
 *
 * @param {'common'|'rare'|'legendary'} rarity
 * @returns {object[]}
 */
export function getItemsByRarity(rarity) {
  return Object.values(ITEMS).filter(i => i.rarity === rarity);
}
