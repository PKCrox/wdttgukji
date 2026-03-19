// 공유 이름 맵 — 엔진 + UI 양쪽에서 사용

export const CHAR_NAMES = {
  cao_cao: '조조', cao_ren: '조인', cao_pi: '조비', cao_hong: '조홍',
  xiahou_dun: '하후돈', xiahou_yuan: '하후연', zhang_liao: '장료',
  xu_chu: '허저', xu_huang: '서황', xun_yu: '순욱', jia_xu: '가후',
  yu_jin: '우금', zhang_he: '장합', yue_jin: '악진', sima_yi: '사마의',
  xun_you: '순유', chen_qun: '진군', hua_xin: '화흠', dong_zhao: '동소',
  man_chong: '만총', jia_kui: '가규', li_dian: '이전', liu_ye: '유엽',
  cheng_yu: '정욱', zang_ba: '장패', wen_pin: '문빙', cao_ang: '조앙',
  cao_chun: '조순', cao_rui: '조예', cao_xiu: '조휴', cao_zhang: '조창',
  cao_zhang_2: '조창', han_hao: '한호', hao_zhao: '학소', niu_jin: '우금',
  wang_lang: '왕랑', wang_shuang: '왕쌍',
  liu_bei: '유비', guan_yu: '관우', zhang_fei: '장비', zhao_yun: '조운',
  zhuge_liang: '제갈량', huang_zhong: '황충', wei_yan: '위연',
  ma_liang: '마량', xu_shu: '서서', guan_ping: '관평', chen_dao: '진도',
  fei_shi: '비시', jian_yong: '간옹', liu_feng: '유봉', liao_hua: '요화',
  li_yan: '이엄', mi_fang: '미방', mi_zhu: '미축', qiao_zhou: '초주',
  sun_qian: '손건', xu_jing: '허정', wu_lan: '오란', deng_zhi: '등지',
  sun_quan: '손권', zhou_yu: '주유', lu_su: '노숙', gan_ning: '감녕',
  huang_gai: '황개', taishi_ci: '태사자', zhou_tai: '주태', kan_ze: '감택',
  cheng_pu: '정보', ding_feng: '정봉', dong_xi: '동습', gu_yong: '고옹',
  han_dang: '한당', ling_tong: '능통', lu_xun: '육손', lv_dai: '여대',
  lv_fan: '여범', pan_zhang: '반장', pan_zhang_npc: '반장', xu_sheng: '서성',
  zhang_zhao: '장소', zhu_ran: '주연', zhu_zhi: '주치',
  liu_biao: '유표', liu_zhang_char: '유장', fa_zheng: '법정',
  zhang_song: '장송', zhang_lu_char: '장로', pang_de: '방덕',
  pang_tong: '방통', ma_chao: '마초', yan_yan: '엄안',
  jiang_wan: '장완', fei_yi: '비의', lu_meng: '여몽', bu_zhi: '보치',
  cai_mao: '채모', chen_deng_npc: '진등', chen_lin: '진림', deng_xian: '등현',
  gao_pei: '고패', gongsun_kang_npc: '공손강', han_sui: '한수', hulao_guard: '호로관 수비장',
  leng_bao: '냉포', liu_bei_p: '유비', liu_qi_npc: '유기', lu_kai_npc: '육개',
  ma_dai: '마대', ma_teng: '마등', shi_xie: '사섭', sun_guan: '손관',
  sun_huan_npc: '손환', tian_chou_npc: '전주', tongguan_guard: '동관 수비장',
  wang_lei: '왕루', xing_daorong: '형도영', yan_yan_guard: '엄안 수비장',
  yang_ang: '양앙', yang_huai: '양회', yang_huai_2: '양회', yang_ren: '양임',
  yang_song: '양송', zhang_yun: '장윤', zhu_huan_npc: '주환'
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
