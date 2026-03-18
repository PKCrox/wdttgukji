/**
 * 이벤트 분기 확장 — 주요 no-choice 이벤트에 2-3개 선택지 추가
 * 208 시나리오 플레이어블 구간(200~280) 위주
 */
import { readFileSync, writeFileSync } from 'fs';

const FILE = 'data/events/all-events.json';
const data = JSON.parse(readFileSync(FILE, 'utf8'));

// choice effect helpers
const stat = (target, s, delta) => ({ type: 'stat_change', target, value: { stat: s, delta } });
const army = (target, delta) => ({ type: 'army_change', target, value: { delta } });
const loy = (target, delta) => ({ type: 'loyalty_change', target, value: delta });
const rel = (target, w, delta) => ({ type: 'relationship_change', target, value: { with: w, delta } });
const gold = (target, delta) => ({ type: 'gold_change', target, value: { delta } });
const rep = (target, delta) => ({ type: 'reputation_change', target, value: { delta } });
const unlock = (target, desc) => ({ type: 'unlock_event', target, value: desc });

// 이벤트별 선택지
const CHOICES = {
  // === 관도 전역 ===
  'hist_200_guandu_battle': [
    { id: 'guandu_burn', text: '허유의 밀보를 받아들여 오소 기습 (사실 기반)',
      effects: [army('yuan_shao', -30000), stat('cao_cao','intellect',5), rel('cao_cao','xu_you',10)] },
    { id: 'guandu_defend', text: '수비에 집중하며 원소군 소모전 유도',
      effects: [army('yuan_shao', -15000), army('wei', -8000), stat('cao_cao','command',3)] },
    { id: 'guandu_retreat', text: '허창 방어로 전환, 관도 포기',
      effects: [army('wei', -5000), rep('wei', -10), gold('wei', 5000)] },
  ],

  // === 삼고초려 ===
  'hist_207_three_visits': [
    { id: 'visit_persist', text: '세 번째도 예를 갖추어 찾아간다',
      effects: [rel('liu_bei','zhuge_liang',30), stat('liu_bei','charisma',5), rep('shu',15)] },
    { id: 'visit_force', text: '장비의 주장대로 끌고 온다',
      effects: [rel('liu_bei','zhuge_liang',-20), loy('zhuge_liang',-15), stat('zhang_fei','charisma',-5)] },
    { id: 'visit_abandon', text: '포기하고 다른 인재를 찾는다',
      effects: [rep('shu', -5), stat('liu_bei','intellect',2)] },
  ],

  // === 적벽대전 전초 ===
  'hist_208_cao_cao_jingzhou_invasion': [
    { id: 'jingzhou_blitz', text: '전군 급진격으로 유비를 추격한다',
      effects: [army('shu', -10000), stat('cao_cao','command',3), army('wei', -5000)] },
    { id: 'jingzhou_consolidate', text: '형주를 안정시킨 후 남하한다',
      effects: [gold('wei', 10000), rep('wei', 5), army('shu', -3000)] },
  ],

  'hist_208_changban_battle': [
    { id: 'changban_zhao', text: '조운에게 유선 구출을 맡기고 퇴각 지속',
      effects: [stat('zhao_yun','war',5), stat('zhao_yun','charisma',5), rel('liu_bei','zhao_yun',15)] },
    { id: 'changban_stand', text: '장비를 후위에 세워 다리에서 저지한다',
      effects: [stat('zhang_fei','war',3), stat('zhang_fei','charisma',5), army('shu', -2000)] },
    { id: 'changban_scatter', text: '병력을 분산하여 각자 도주한다',
      effects: [army('shu', -8000), rep('shu', -10)] },
  ],

  // === 적벽대전 ===
  'hist_208_red_cliffs': [
    { id: 'red_cliffs_fire', text: '화공 작전 실행 — 황개의 거짓 항복 + 동남풍',
      effects: [army('wei', -50000), stat('zhou_yu','command',5), stat('zhuge_liang','intellect',5), rep('wu',20)] },
    { id: 'red_cliffs_naval', text: '수군 정면 결전으로 승부한다',
      effects: [army('wei', -25000), army('wu', -15000), stat('zhou_yu','war',3)] },
    { id: 'red_cliffs_negotiate', text: '조조에게 강화를 제안한다',
      effects: [rep('wu', -20), rep('shu', -15), gold('wu', 15000)] },
  ],

  // === 유비 형주 남부 ===
  'hist_209_liu_bei_gains_southern_jing_province': [
    { id: 'jing_south_4', text: '형주 남부 4군 모두 점령',
      effects: [gold('shu', 15000), army('shu', 10000), rep('shu', 10)] },
    { id: 'jing_south_2', text: '2군만 점령하고 나머지는 오나라와 분할',
      effects: [gold('shu', 8000), rel('liu_bei','sun_quan',10), rep('shu', 5)] },
  ],

  // === 유비 성도 함락 ===
  'hist_214_liu_bei_conquers_chengdu_ma_chao_submits': [
    { id: 'chengdu_siege', text: '성도 포위, 마초를 선봉으로 압박',
      effects: [army('liu_zhang', -15000), stat('ma_chao','charisma',5), rep('shu', -5)] },
    { id: 'chengdu_negotiate', text: '유장에게 항복을 권유',
      effects: [gold('shu', 20000), rep('shu', 10), loy('fa_zheng',10)] },
    { id: 'chengdu_starve', text: '장기 포위로 성도를 고사시킨다',
      effects: [army('liu_zhang', -10000), gold('shu', -5000), army('shu', -3000)] },
  ],

  // === 합비 전투 ===
  'hist_215_battle_of_hefei_zhang_lu_submits': [
    { id: 'hefei_zhang_liao', text: '장료 800기로 기습 돌격',
      effects: [stat('zhang_liao','war',5), stat('zhang_liao','charisma',5), army('wu', -10000)] },
    { id: 'hefei_defend', text: '합비성 수비에 집중',
      effects: [army('wu', -5000), army('wei', -2000), stat('zhang_liao','command',3)] },
  ],

  // === 정군산 ===
  'hist_219_battle_of_mount_dingjun': [
    { id: 'dingjun_charge', text: '황충에게 산정 돌격을 명한다',
      effects: [stat('huang_zhong','war',5), army('wei', -8000)] },
    { id: 'dingjun_surround', text: '포위 전술로 하후연을 고립시킨다',
      effects: [army('wei', -12000), army('shu', -5000), stat('zhuge_liang','command',3)] },
    { id: 'dingjun_night', text: '야습으로 위군 보급을 끊는다',
      effects: [army('wei', -6000), gold('wei', -8000), stat('fa_zheng','intellect',3)] },
  ],

  // === 한중왕 등극 ===
  'hist_219_liu_bei_becomes_king_of_hanzhong': [
    { id: 'king_declare', text: '한중왕으로 즉위하고 관우를 전장군에 임명',
      effects: [rep('shu', 15), stat('liu_bei','charisma',3), loy('guan_yu',-5)] },
    { id: 'king_modest', text: '왕호를 사양하고 실리에 집중',
      effects: [gold('shu', 10000), rep('shu', 5)] },
  ],

  // === 번성 공방전 / 관우 사망 ===
  'hist_219_battle_of_fancheng_guan_yu_s_death': [
    { id: 'fancheng_flood', text: '수공으로 우금 7군을 수몰시킨다',
      effects: [army('wei', -30000), stat('guan_yu','command',5), rep('shu', 10)] },
    { id: 'fancheng_retreat', text: '오나라 동향을 경계하며 철수한다',
      effects: [army('shu', -3000), rep('shu', -5)] },
    { id: 'fancheng_push', text: '번성까지 밀어붙인다 (뒤통수 위험)',
      effects: [army('wei', -20000), army('shu', -15000)] },
  ],

  // === 조조 사망 ===
  'hist_220_cao_cao_dies_cao_pi_establishes_wei': [
    { id: 'succeed_pi', text: '조비가 순조롭게 계승',
      effects: [rep('wei', 5), gold('wei', 10000)] },
    { id: 'succeed_fight', text: '조식과 조비의 후계 다툼',
      effects: [rep('wei', -10), army('wei', -5000)] },
  ],

  // === 장비 암살 ===
  'hist_221_zhang_fei_assassinated': [
    { id: 'fei_drunk', text: '장비가 술에 취한 채 부하에게 살해된다',
      effects: [army('shu', -5000), rep('shu', -10)] },
    { id: 'fei_warned', text: '유비의 경고에 따라 호위를 강화한다',
      effects: [stat('zhang_fei','intellect',5), rep('shu', 5)] },
  ],

  // === 이릉대전 ===
  'hist_222_battle_of_yiling': [
    { id: 'yiling_push', text: '전군 돌격으로 오나라를 압도한다',
      effects: [army('shu', -40000), army('wu', -15000), rep('shu', -20)] },
    { id: 'yiling_caution', text: '제갈량의 조언을 듣고 신중하게 진군',
      effects: [army('shu', -10000), army('wu', -8000), stat('liu_bei','intellect',3)] },
    { id: 'yiling_cancel', text: '복수를 포기하고 촉으로 돌아간다',
      effects: [rep('shu', -5), rel('liu_bei','zhuge_liang',10), gold('shu', 10000)] },
  ],

  // === 제갈량 출사표 ===
  'hist_227_first_northern_expedition_chu_shi_biao': [
    { id: 'northern_full', text: '전력을 동원해 북벌에 나선다',
      effects: [army('shu', 20000), rep('shu', 15), gold('shu', -15000)] },
    { id: 'northern_probe', text: '소규모 선발대로 정찰 후 본대 투입',
      effects: [army('shu', 10000), stat('zhuge_liang','command',3), gold('shu', -8000)] },
  ],

  // === 가정 전투 (마속) ===
  'hist_228_second_northern_expedition': [
    { id: 'jieting_su', text: '마속에게 가정 수비를 맡긴다 (역사 그대로)',
      effects: [army('shu', -15000), rep('shu', -10)] },
    { id: 'jieting_yan', text: '위연에게 가정 수비를 맡긴다',
      effects: [army('shu', -5000), stat('wei_yan','command',5)] },
    { id: 'jieting_avoid', text: '가정을 포기하고 우회 진격',
      effects: [army('shu', -3000), gold('shu', -5000)] },
  ],

  // === 오장원 ===
  'hist_234_battle_of_wuzhang_plains_zhuge_liang_die': [
    { id: 'wuzhang_duel', text: '사마의에게 결전을 요구한다',
      effects: [army('shu', -10000), army('wei', -10000), stat('zhuge_liang','command',3)] },
    { id: 'wuzhang_wait', text: '둔전을 경영하며 장기전에 돌입',
      effects: [gold('shu', 5000), army('shu', -3000)] },
    { id: 'wuzhang_retreat', text: '건강 악화로 철수를 결정',
      effects: [rep('shu', -5), army('shu', -2000)] },
  ],

  // === 고평릉 사변 ===
  'hist_249_gaoping_ling_incident_sima_yi_seizes_pow': [
    { id: 'gaoping_coup', text: '사마의가 조상 일파를 숙청',
      effects: [rep('wei', -15), stat('sima_yi','politics',5)] },
    { id: 'gaoping_resist', text: '조상이 저항을 시도한다',
      effects: [army('wei', -8000), rep('wei', -5)] },
  ],

  // === 동관 전투 (마초) ===
  'hist_211_tong_pass_battle': [
    { id: 'tong_charge', text: '마초가 전면 돌격으로 조조를 추격',
      effects: [army('wei', -15000), stat('ma_chao','war',5)] },
    { id: 'tong_alliance', text: '한수와 연합하여 양면 공격',
      effects: [army('wei', -20000), army('shu', -8000)] },
    { id: 'tong_divide', text: '조조의 이간계에 넘어간다',
      effects: [rel('ma_chao','han_sui',-30), army('shu', -10000), stat('cao_cao','intellect',5)] },
  ],

  // === 형주 분쟁 ===
  'hist_215_jingzhou_dispute': [
    { id: 'jingzhou_split', text: '형주를 촉오 양분한다 (역사 기반)',
      effects: [rel('liu_bei','sun_quan',5), gold('shu', -5000)] },
    { id: 'jingzhou_keep', text: '유비가 형주 전체를 고수한다',
      effects: [rel('liu_bei','sun_quan',-20), army('shu', 5000)] },
    { id: 'jingzhou_return', text: '형주 전체를 오나라에 반환',
      effects: [rel('liu_bei','sun_quan',20), rep('shu', 10), gold('shu', -10000)] },
  ],

  // === 연의 소설 이벤트들 ===
  'novel_ch43_손권을_항조_결심시킴': [
    { id: 'resist_cao', text: '제갈량의 설전을 듣고 항전을 결심',
      effects: [rep('wu', 10), rel('sun_quan','zhuge_liang',10)] },
    { id: 'submit_cao', text: '장소의 건의대로 조조에 항복',
      effects: [rep('wu', -30), gold('wu', 20000)] },
  ],

  'novel_ch46_제갈량이_안개_속에서_화살_수집': [
    { id: 'arrow_boats', text: '초선차시 — 짚배로 조조군 화살 10만 개 수집',
      effects: [stat('zhuge_liang','intellect',5), army('wu', 5000)] },
    { id: 'arrow_fail', text: '안개가 일찍 걷혀 들킨다',
      effects: [army('wu', -3000), stat('zhuge_liang','intellect',-2)] },
  ],

  'novel_ch47_황개의_거짓_항복_계획': [
    { id: 'fake_submit', text: '고육지계 — 황개가 거짓 항복',
      effects: [stat('huang_gai','charisma',5), stat('zhou_yu','intellect',3)] },
    { id: 'real_attack', text: '거짓 항복 없이 정면 공격 준비',
      effects: [army('wu', -5000), stat('zhou_yu','command',3)] },
  ],

  'novel_ch52_유비_형주_남부_4군_점령': [
    { id: 'take_all_4', text: '4군 모두 점령 — 영토 극대화',
      effects: [gold('shu', 15000), army('shu', 10000), rep('shu', 10)] },
    { id: 'take_2_share', text: '2군만 취하고 오나라와 분배',
      effects: [gold('shu', 8000), rel('liu_bei','sun_quan',10)] },
  ],

  'novel_ch57_주유_사망': [
    { id: 'zhou_yu_dies', text: '주유가 분사한다 — "기생유, 하생량"',
      effects: [rep('wu', -10), stat('lu_su','politics',5)] },
    { id: 'zhou_yu_recovers', text: '주유가 회복하여 서촉 원정을 계획',
      effects: [stat('zhou_yu','command',5), rel('sun_quan','zhou_yu',10)] },
  ],

  'novel_ch58_마초_복수의_거병': [
    { id: 'machao_revenge', text: '부친의 복수를 위해 서량군 총동원',
      effects: [army('shu', 20000), stat('ma_chao','war',3), rep('shu', -5)] },
    { id: 'machao_wait', text: '세력을 키운 후 거병한다',
      effects: [army('shu', 10000), gold('shu', 5000)] },
  ],

  'novel_ch63_방통_화살에_전사': [
    { id: 'pangtong_dies', text: '낙봉파에서 방통이 전사',
      effects: [rep('shu', -10), army('shu', -5000)] },
    { id: 'pangtong_detour', text: '방통이 다른 길로 우회',
      effects: [stat('pang_tong','intellect',3), army('shu', -2000)] },
  ],

  'novel_ch66_장료_합비에서_손권군_대파': [
    { id: 'hefei_800', text: '장료 800기 돌격 — 10만 대군 격파',
      effects: [stat('zhang_liao','war',5), stat('zhang_liao','charisma',5), army('wu', -15000)] },
    { id: 'hefei_turtle', text: '합비성에서 농성',
      effects: [army('wu', -5000), army('wei', -2000)] },
  ],

  'novel_ch71_황충이_하후연_참수': [
    { id: 'hw_charge', text: '황충이 돌격하여 하후연을 참수',
      effects: [stat('huang_zhong','war',5), army('wei', -10000)] },
    { id: 'hw_surround', text: '포위전으로 위군을 고립시킨다',
      effects: [army('wei', -8000), army('shu', -3000), stat('fa_zheng','intellect',3)] },
  ],

  'novel_ch76_여몽이_백의도강으로_형주_함락': [
    { id: 'lumeng_stealth', text: '백의도강 — 상인 복장으로 형주 침투',
      effects: [stat('lu_meng','intellect',5), army('shu', -20000)] },
    { id: 'lumeng_naval', text: '수군 정면 공격으로 형주 공략',
      effects: [army('wu', -10000), army('shu', -15000)] },
  ],

  'novel_ch77_관우_포로_후_처형': [
    { id: 'guan_execute', text: '관우를 처형한다',
      effects: [rep('wu', -15), rel('liu_bei','sun_quan',-30)] },
    { id: 'guan_release', text: '관우를 석방하여 촉과의 동맹 유지',
      effects: [rel('liu_bei','sun_quan',15), rep('wu', 10), loy('guan_yu',10)] },
  ],

  'novel_ch82_유비_대군으로_오나라_침공': [
    { id: 'attack_wu_full', text: '70만 대군으로 오나라 전면 침공',
      effects: [army('shu', -40000), army('wu', -20000), rep('shu', -10)] },
    { id: 'attack_wu_limited', text: '소규모 징벌전으로 형주만 탈환',
      effects: [army('shu', -10000), army('wu', -8000)] },
    { id: 'attack_wu_cancel', text: '제갈량의 간언을 듣고 원정 취소',
      effects: [rep('shu', 5), rel('liu_bei','zhuge_liang',10)] },
  ],

  'novel_ch83_육손의_화공으로_유비_대패': [
    { id: 'yiling_fire', text: '육손의 화공에 700리 진영 전소',
      effects: [army('shu', -50000), stat('lu_xun','command',5)] },
    { id: 'yiling_avoid', text: '연채 진영을 분산하여 화공 피해 최소화',
      effects: [army('shu', -15000), army('wu', -10000)] },
  ],

  'novel_ch85_유비_사망': [
    { id: 'baidicheng_trust', text: '제갈량에게 후사를 맡긴다 (백제성 탁고)',
      effects: [loy('zhuge_liang',20), rep('shu', 10)] },
    { id: 'baidicheng_doubt', text: '유선 직접 통치를 유언한다',
      effects: [rep('shu', -5), loy('zhuge_liang',-10)] },
  ],

  'novel_ch90_맹획_7차_포획_후_진심_귀순': [
    { id: 'meng_7th', text: '일곱 번째에도 풀어주고 진심 항복을 받는다',
      effects: [rep('shu', 20), stat('zhuge_liang','charisma',5)] },
    { id: 'meng_execute', text: '반복되는 반란에 처형한다',
      effects: [rep('shu', -10), army('shu', -5000)] },
  ],

  'novel_ch95_마속의_전략적_실패': [
    { id: 'jieting_masu', text: '마속에게 가정을 맡긴다 — 산 위 진지 고집',
      effects: [army('shu', -20000), rep('shu', -15)] },
    { id: 'jieting_weiyan', text: '위연에게 가정 수비를 맡긴다',
      effects: [army('shu', -5000), stat('wei_yan','command',5)] },
    { id: 'jieting_zhuge', text: '제갈량이 직접 가정을 지휘한다',
      effects: [army('shu', -3000), stat('zhuge_liang','command',3)] },
  ],

  'novel_ch103_제갈량_상방곡에서_사마의_화공_시도_비로_실패': [
    { id: 'valley_fire', text: '상방곡에 사마의를 유인하여 화공',
      effects: [army('wei', -10000)] },
    { id: 'valley_ambush', text: '매복으로 사마의 본대를 기습',
      effects: [army('wei', -8000), army('shu', -3000)] },
  ],

  'novel_ch104_제갈량_별_떨어짐_의식_실패': [
    { id: 'lamp_fail', text: '칠성등이 꺼진다 — 수명 연장 실패',
      effects: [rep('shu', -10)] },
    { id: 'lamp_success', text: '칠성등이 유지된다 — 제갈량 연명',
      effects: [stat('zhuge_liang','intellect',5), rep('shu', 10)] },
  ],

  'novel_ch116_등애와_종회의_촉한_침공_시작': [
    { id: 'shu_defend', text: '강유가 검각에서 방어진을 치른다',
      effects: [army('wei', -10000), army('shu', -5000)] },
    { id: 'shu_counterattack', text: '적극적으로 역습한다',
      effects: [army('wei', -15000), army('shu', -10000)] },
    { id: 'shu_retreat_chengdu', text: '성도로 퇴각하여 최종 방어',
      effects: [army('shu', -8000), gold('shu', -10000)] },
  ],

  // === 연의 기타 주요 ===
  'novel_ch25_관우_세_가지_조건으로_항복': [
    { id: 'guan_conditions', text: '세 가지 조건을 걸고 항복한다',
      effects: [loy('guan_yu', -10), rel('guan_yu','cao_cao',10), stat('guan_yu','charisma',5)] },
    { id: 'guan_fight', text: '끝까지 저항한다',
      effects: [army('shu', -5000), stat('guan_yu','war',3)] },
  ],

  'novel_ch54_유비가_손상향과_결혼': [
    { id: 'marry_sun', text: '정략결혼을 수락한다',
      effects: [rel('liu_bei','sun_quan',15), rep('shu', 5)] },
    { id: 'reject_sun', text: '함정을 의심하여 거절',
      effects: [rel('liu_bei','sun_quan',-10), rep('shu', -5)] },
  ],

  'novel_ch62_유비와_유장_전쟁_시작': [
    { id: 'yi_war_start', text: '방통의 계책에 따라 공격 개시',
      effects: [army('liu_zhang', -10000), rep('shu', -10)] },
    { id: 'yi_negotiate', text: '외교로 유장을 설득한다',
      effects: [gold('shu', -10000), rep('shu', 5)] },
  ],

  // 원소 사망 후 내분
  'hist_202_yuan_shao_s_death_succession_crisis': [
    { id: 'yuan_split', text: '원상과 원담이 분열한다',
      effects: [rep('wei', 5), stat('cao_cao','politics',3)] },
    { id: 'yuan_unite', text: '원씨 형제가 연합하여 조조에 대항',
      effects: [army('wei', -10000)] },
  ],

  // 백랑산
  'hist_207_bailang_battle': [
    { id: 'bailang_charge', text: '장료 선봉으로 오환 기습',
      effects: [stat('zhang_liao','war',3), army('wei', -3000)] },
    { id: 'bailang_siege', text: '포위전으로 보급을 끊는다',
      effects: [army('wei', -5000), gold('wei', -5000)] },
  ],

  // 양평관
  'hist_215_yangping_pass_battle': [
    { id: 'yangping_storm', text: '야간 기습으로 양평관 탈취',
      effects: [army('zhang_lu', -8000), army('wei', -3000)] },
    { id: 'yangping_negotiate', text: '장로에게 항복을 권유',
      effects: [gold('wei', 10000), rep('wei', 5)] },
  ],
};

// 패치 적용
let patched = 0;
for (const ev of data.events) {
  if (CHOICES[ev.id] && (!ev.choices || ev.choices.length === 0)) {
    ev.choices = CHOICES[ev.id];
    patched++;
  }
}

// 이미 choices 있는 이벤트에도 매칭 시도 (중복 skip)
console.log(`Patched: ${patched} events`);
console.log(`Total multi-choice events: ${data.events.filter(e => e.choices?.length > 1).length}`);
console.log(`Remaining no-choice: ${data.events.filter(e => !e.choices || e.choices.length === 0).length}`);

writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log('Written to', FILE);
