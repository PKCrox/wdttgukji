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
