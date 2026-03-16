// 공유 이름 맵 — 엔진 + UI 양쪽에서 사용

export const CHAR_NAMES = {
  cao_cao: '조조', cao_ren: '조인', cao_pi: '조비', cao_hong: '조홍',
  xiahou_dun: '하후돈', xiahou_yuan: '하후연', zhang_liao: '장료',
  xu_chu: '허저', xu_huang: '서황', xun_yu: '순욱', jia_xu: '가후',
  yu_jin: '우금', zhang_he: '장합', yue_jin: '악진', sima_yi: '사마의',
  liu_bei: '유비', guan_yu: '관우', zhang_fei: '장비', zhao_yun: '조운',
  zhuge_liang: '제갈량', huang_zhong: '황충', wei_yan: '위연',
  ma_liang: '마량', xu_shu: '서서',
  sun_quan: '손권', zhou_yu: '주유', lu_su: '노숙', gan_ning: '감녕',
  huang_gai: '황개', taishi_ci: '태사자', zhou_tai: '주태', kan_ze: '감택',
  liu_biao: '유표', liu_zhang_char: '유장', fa_zheng: '법정',
  zhang_song: '장송', zhang_lu_char: '장로', pang_de: '방덕',
  pang_tong: '방통', ma_chao: '마초', yan_yan: '엄안',
  jiang_wan: '장완', fei_yi: '비의', lu_meng: '여몽'
};

export const FACTION_NAMES = {
  wei: '위', shu: '촉', wu: '오',
  liu_zhang: '유장', zhang_lu: '장로'
};

export const STAT_NAMES = {
  command: '통솔', war: '무력', intellect: '지력',
  politics: '정치', charisma: '매력',
  fame: '명성', charm: '매력'
};

export function getCharName(id) {
  return CHAR_NAMES[id] || id;
}

export function getFactionName(id) {
  return FACTION_NAMES[id] || id;
}

export function getStatName(stat) {
  return STAT_NAMES[stat] || stat;
}

// ─── 스킬 이름 ───
export const SKILL_NAMES = {
  fire_attack: '화공', charge_master: '돌격', naval: '수군',
  ambush_master: '매복', iron_wall: '철벽', insight: '간파',
  duel_master: '일기토', cavalry: '기마', governance: '치국',
  recruitment_master: '징모', charm: '인덕', spy_master: '첩보',
  logistics: '보급', medicine: '의술', inventor: '발명'
};

// ─── 아이템 이름 ───
export const ITEM_NAMES = {
  green_dragon: '청룡언월도', serpent_spear: '장팔사모', sky_piercer: '방천화극',
  paired_swords: '자웅쌍검', heaven_sword: '의천검', ancient_blade: '고정도',
  seven_star: '칠성검', silver_armor: '백은갑', bright_armor: '명광갑',
  red_hare: '적토마', hex_mark: '적로마', shadow: '절영', golden_claw: '조황비전',
  mengde_book: '맹덕신서', art_of_war: '손자병법', taiping_book: '태평요술',
  imperial_seal: '전국옥새', formation_map: '24진도'
};

// ─── 건물 이름 ───
export const BUILDING_NAMES = {
  market: '시장', forge: '대장간', barracks: '병영',
  walls: '성벽', watchtower: '망루', granary: '곡창', academy: '학당'
};

// ─── 기술 이름 ───
export const TECH_NAMES = {
  improved_weapons: '개량 병기', siege_engines: '공성기', crossbow: '연노',
  cavalry_training: '기병 훈련', naval_tech: '조선술',
  irrigation: '관개 수리', trade_routes: '교역로', currency_reform: '화폐 개혁',
  medicine_tech: '의술 연구', espionage_network: '첩보망', diplomacy_school: '외교술'
};

// ─── 첩보 행동 이름 ───
export const ESPIONAGE_NAMES = {
  scout: '정찰', rumor: '유언비어', sabotage: '공작',
  incite: '이간', steal_info: '기밀 탈취'
};

export function getSkillName(id) { return SKILL_NAMES[id] || id; }
export function getItemName(id) { return ITEM_NAMES[id] || id; }
export function getBuildingName(id) { return BUILDING_NAMES[id] || id; }
export function getTechName(id) { return TECH_NAMES[id] || id; }
