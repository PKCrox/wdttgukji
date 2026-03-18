/**
 * 이벤트 분기 확장 2차 — 나머지 168개 no-choice 이벤트에 선택지 추가
 */
import { readFileSync, writeFileSync } from 'fs';

const FILE = 'data/events/all-events.json';
const data = JSON.parse(readFileSync(FILE, 'utf8'));

const s = (t, st, d) => ({ type: 'stat_change', target: t, value: { stat: st, delta: d } });
const a = (t, d) => ({ type: 'army_change', target: t, value: { delta: d } });
const l = (t, d) => ({ type: 'loyalty_change', target: t, value: d });
const r = (t, w, d) => ({ type: 'relationship_change', target: t, value: { with: w, delta: d } });
const g = (t, d) => ({ type: 'gold_change', target: t, value: { delta: d } });
const rp = (t, d) => ({ type: 'reputation_change', target: t, value: { delta: d } });

const C = {
  // === 184~199 초반부 ===
  'hist_184_oath_of_the_peach_garden': [
    { id: 'oath_sworn', text: '도원에서 의형제를 맺는다', effects: [r('liu_bei','guan_yu',20), r('liu_bei','zhang_fei',20), rp('shu',10)] },
    { id: 'oath_skip', text: '맹세를 거절한다', effects: [rp('shu',-5)] },
  ],
  'novel_ch1_유비_관우_장비_도원결의': [
    { id: 'oath_sworn2', text: '하늘에 맹세한다 — 같은 날 죽자', effects: [r('liu_bei','guan_yu',20), r('liu_bei','zhang_fei',20)] },
    { id: 'oath_casual', text: '형식 없이 뜻만 모은다', effects: [r('liu_bei','guan_yu',10), r('liu_bei','zhang_fei',10)] },
  ],
  'novel_ch1_황건적의_난_발발': [
    { id: 'yellow_join', text: '의용군을 조직하여 토벌에 참전', effects: [a('shu',5000), rp('shu',10)] },
    { id: 'yellow_watch', text: '관망하며 세력을 키운다', effects: [g('shu',3000)] },
  ],
  'hist_184_he_jin_appointed_general': [
    { id: 'hejin_support', text: '하진의 대장군 임명을 지지', effects: [rp('wei',5)] },
    { id: 'hejin_oppose', text: '환관 세력과 결탁', effects: [g('wei',5000), rp('wei',-10)] },
  ],
  'hist_189_ten_eunuchs_coup_dong_zhuo_seizes_power': [
    { id: 'eunuch_resist', text: '십상시에 맞서 궁을 탈환', effects: [a('wei',-5000), rp('wei',10)] },
    { id: 'eunuch_flee', text: '혼란을 틈타 도주', effects: [rp('wei',-5)] },
  ],
  'hist_189_ten_eunuchs_incident': [
    { id: 'eunuch_purge', text: '환관 세력을 숙청한다', effects: [rp('wei',10), a('wei',-3000)] },
    { id: 'eunuch_compromise', text: '환관과 타협하여 안정시킨다', effects: [g('wei',5000)] },
  ],
  'hist_189_dong_zhuo_seizes_power': [
    { id: 'dz_resist', text: '동탁에 맞서 저항한다', effects: [a('wei',-5000), rp('wei',15)] },
    { id: 'dz_submit', text: '동탁의 권위를 인정한다', effects: [rp('wei',-15), g('wei',5000)] },
  ],
  'hist_190_anti_dong_zhuo_coalition_battle_of_hulao': [
    { id: 'hulao_vanguard', text: '선봉으로 호뢰관 공격', effects: [a('shu',-3000), s('liu_bei','charisma',3)] },
    { id: 'hulao_support', text: '후방에서 지원', effects: [g('shu',-2000)] },
    { id: 'hulao_passive', text: '관망한다', effects: [rp('shu',-5)] },
  ],
  'hist_190_anti_dong_zhuo_coalition': [
    { id: 'coalition_lead', text: '적극적으로 연합군을 이끈다', effects: [rp('shu',10), a('shu',-3000)] },
    { id: 'coalition_follow', text: '참여하되 주도하지 않는다', effects: [rp('shu',3)] },
  ],
  'hist_190_dong_zhuo_punitive_campaign': [
    { id: 'punitive_attack', text: '동탁 본진을 직접 공격', effects: [a('wei',-5000), rp('wei',10)] },
    { id: 'punitive_flank', text: '측면에서 기습한다', effects: [a('wei',-3000), s('cao_cao','command',3)] },
  ],
  'hist_190_dong_zhuo_burns_luoyang': [
    { id: 'luoyang_rescue', text: '낙양 백성을 구출한다', effects: [rp('shu',10), g('shu',-5000)] },
    { id: 'luoyang_pursue', text: '동탁을 추격한다', effects: [a('shu',-5000)] },
  ],
  'hist_190_battle_of_yangcheng': [
    { id: 'yangcheng_fight', text: '양성에서 전면전', effects: [a('wei',-5000), a('shu',-3000)] },
    { id: 'yangcheng_ambush', text: '매복전을 펼친다', effects: [a('wei',-8000), a('shu',-2000)] },
  ],
  'hist_191_coalition_collapse': [
    { id: 'collapse_unite', text: '연합 유지를 위해 중재', effects: [rp('shu',5), s('liu_bei','politics',2)] },
    { id: 'collapse_leave', text: '연합을 이탈하고 독자 세력화', effects: [rp('shu',-5), g('shu',5000)] },
  ],
  'hist_191_gongsun_zan_vs_yuan_shao': [
    { id: 'gz_support_gongsun', text: '공손찬을 지원한다', effects: [rp('shu',5)] },
    { id: 'gz_neutral', text: '중립을 유지한다', effects: [g('shu',3000)] },
  ],
  'hist_191_yuan_shao_jizhou': [
    { id: 'jizhou_oppose', text: '원소의 기주 탈취에 반대', effects: [rp('shu',5)] },
    { id: 'jizhou_ignore', text: '무시한다', effects: [] },
  ],
  'hist_191_jieqiao_battle': [
    { id: 'jieqiao_charge', text: '기병 돌격으로 적 진영을 돌파', effects: [a('shu',-3000)] },
    { id: 'jieqiao_defend', text: '방어진을 치고 소모전', effects: [a('shu',-2000)] },
  ],
  'hist_192_dong_zhuo_assassinated_by_lu_bu': [
    { id: 'dz_celebrate', text: '동탁 처단을 환영한다', effects: [rp('shu',5)] },
    { id: 'dz_wary', text: '여포/왕윤의 권력 장악을 경계', effects: [s('liu_bei','intellect',2)] },
  ],
  'hist_192_dong_zhuo_assassination': [
    { id: 'assassin_support', text: '암살 세력을 지원한다', effects: [rp('shu',5)] },
    { id: 'assassin_distance', text: '거리를 둔다', effects: [] },
  ],
  'hist_192_changan_battle': [
    { id: 'changan_intervene', text: '장안 전투에 개입', effects: [a('shu',-5000), rp('shu',5)] },
    { id: 'changan_stay', text: '관여하지 않는다', effects: [] },
  ],
  'hist_193_first_xuzhou_massacre': [
    { id: 'xuzhou_rescue', text: '서주 백성을 구호한다', effects: [rp('shu',15), g('shu',-5000)] },
    { id: 'xuzhou_condemn', text: '조조의 학살을 규탄한다', effects: [rp('shu',5), r('liu_bei','cao_cao',-10)] },
  ],
  'hist_194_second_xuzhou_massacre_sun_ce_gains_jian': [
    { id: 'xuzhou2_defend', text: '서주 방어에 나선다', effects: [a('shu',-5000), rp('shu',10)] },
    { id: 'xuzhou2_retreat', text: '서주를 포기하고 남하', effects: [g('shu',5000)] },
  ],
  'hist_194_puyang_battle': [
    { id: 'puyang_fire', text: '화공으로 적을 몰아낸다', effects: [a('wei',-8000)] },
    { id: 'puyang_siege', text: '포위전으로 고립시킨다', effects: [a('wei',-5000), a('shu',-3000)] },
  ],
  'hist_194_sun_ce_jiangdong': [
    { id: 'sunce_ally', text: '손책과 동맹', effects: [r('liu_bei','sun_quan',10)] },
    { id: 'sunce_ignore', text: '관여하지 않는다', effects: [] },
  ],
  'hist_195_emperor_xian_escape': [
    { id: 'rescue_emperor', text: '헌제를 구출한다', effects: [rp('shu',15), g('shu',-8000)] },
    { id: 'ignore_emperor', text: '개입하지 않는다', effects: [] },
  ],
  'hist_196_lu_bu_captures_xuzhou_cao_cao_installs_e': [
    { id: 'lubu_fight', text: '여포에 맞서 서주를 지킨다', effects: [a('shu',-8000)] },
    { id: 'lubu_flee', text: '서주를 버리고 조조에게 의탁', effects: [r('liu_bei','cao_cao',10), rp('shu',-10)] },
  ],
  'hist_196_cao_cao_protects_emperor': [
    { id: 'emperor_support', text: '조조의 헌제 보호를 지지', effects: [r('liu_bei','cao_cao',5)] },
    { id: 'emperor_suspect', text: '조조의 의도를 의심한다', effects: [s('liu_bei','intellect',2)] },
  ],
  'hist_197_yuan_shu_campaign': [
    { id: 'yuanshu_attack', text: '원술 토벌에 참전', effects: [a('shu',-3000), rp('shu',5)] },
    { id: 'yuanshu_avoid', text: '전투를 회피한다', effects: [] },
  ],
  'hist_198_battle_of_xiapi_lu_bu_defeated': [
    { id: 'xiapi_flood', text: '수공으로 하비성을 수몰', effects: [a('wei',-3000)] },
    { id: 'xiapi_starve', text: '장기 포위로 여포를 굶긴다', effects: [a('wei',-2000), g('wei',-5000)] },
  ],
  'hist_199_yuan_shao_northern_hegemony': [
    { id: 'yuanshao_ally', text: '원소와 동맹하여 조조에 대항', effects: [r('liu_bei','yuan_shao',10)] },
    { id: 'yuanshao_independent', text: '독자 노선을 걷는다', effects: [rp('shu',5)] },
  ],
  'hist_200_cao_cao_vs_liu_bei': [
    { id: 'liubei_fight', text: '조조군에 맞서 싸운다', effects: [a('shu',-8000), s('liu_bei','war',2)] },
    { id: 'liubei_flee', text: '원소에게로 도주한다', effects: [a('shu',-3000)] },
  ],
  'hist_200_baima_battle': [
    { id: 'baima_guanyu', text: '관우에게 출격을 명한다', effects: [s('guan_yu','war',3), s('guan_yu','charisma',5)] },
    { id: 'baima_combined', text: '합동 작전으로 공격', effects: [a('wei',-5000)] },
  ],

  // === 200~210 중반부 ===
  'hist_204_cao_cao_captures_ye': [
    { id: 'ye_storm', text: '업성 총공격', effects: [a('wei',-10000), g('wei',15000)] },
    { id: 'ye_siege', text: '장기 포위', effects: [a('wei',-5000), g('wei',10000)] },
  ],
  'hist_205_yuan_tan_defeated_and_executed': [
    { id: 'yuantan_execute', text: '원담을 처형한다', effects: [rp('wei',-5)] },
    { id: 'yuantan_spare', text: '원담을 등용한다', effects: [rp('wei',5)] },
  ],
  'hist_203_207_cao_cao_northern_unification': [
    { id: 'north_fast', text: '속전속결로 북방 통일', effects: [a('wei',-15000), g('wei',20000)] },
    { id: 'north_slow', text: '단계적으로 하나씩 평정', effects: [a('wei',-8000), g('wei',15000)] },
  ],
  'hist_208_hefei_battle': [
    { id: 'hefei_attack', text: '합비를 공격한다', effects: [a('wu',-8000), a('wei',-5000)] },
    { id: 'hefei_retreat', text: '합비 공격을 포기', effects: [rp('wu',-5)] },
  ],
  'hist_209_nanjun_battle': [
    { id: 'nanjun_take', text: '남군을 점령한다', effects: [g('shu',8000), a('shu',-5000)] },
    { id: 'nanjun_share', text: '오나라와 남군을 분할', effects: [r('liu_bei','sun_quan',5), g('shu',4000)] },
  ],
  'hist_210_zhuge_liang_rises': [
    { id: 'zhuge_trust', text: '제갈량에게 전권을 맡긴다', effects: [l('zhuge_liang',10), s('zhuge_liang','politics',3)] },
    { id: 'zhuge_limit', text: '제갈량의 권한을 제한한다', effects: [l('zhuge_liang',-5)] },
  ],

  // === 210~220 ===
  'hist_216/05/29__': [
    { id: 'weiking_accept', text: '조조가 위왕을 수락한다', effects: [rp('wei',10), rp('shu',-5)] },
    { id: 'weiking_refuse', text: '위왕을 사양한다', effects: [rp('wei',15), s('cao_cao','charisma',3)] },
  ],
  'hist_219/06__': [
    { id: 'hanzhong_hold', text: '한중을 확고히 지킨다', effects: [g('shu',-5000), a('shu',5000)] },
    { id: 'hanzhong_expand', text: '한중에서 북진한다', effects: [a('shu',-8000), a('wei',-5000)] },
  ],
  'hist_220/12/11__': [
    { id: 'wei_founding_condemn', text: '위나라 건국을 규탄한다', effects: [rp('shu',10), r('liu_bei','cao_pi',-20)] },
    { id: 'wei_founding_accept', text: '현실을 인정한다', effects: [r('liu_bei','cao_pi',5)] },
  ],
  'hist_221/04/06__': [
    { id: 'shu_founding', text: '촉한을 건국하고 정통성을 주장', effects: [rp('shu',15), g('shu',-10000)] },
    { id: 'shu_delay', text: '건국을 미루고 실력을 키운다', effects: [g('shu',5000)] },
  ],
  'hist_227__': [
    { id: 'chushibiao_full', text: '출사표를 올리고 전력 북벌', effects: [rp('shu',15), a('shu',15000), g('shu',-15000)] },
    { id: 'chushibiao_partial', text: '소규모 원정만 한다', effects: [a('shu',8000), g('shu',-8000)] },
  ],
  'hist_228/02__': [
    { id: 'jieting_masu2', text: '마속을 가정에 배치한다', effects: [a('shu',-15000)] },
    { id: 'jieting_weiyan2', text: '위연을 가정에 배치한다', effects: [a('shu',-5000), s('wei_yan','command',3)] },
  ],
  'hist_228/05__': [
    { id: 'jiangwei_recruit', text: '강유를 영입한다', effects: [l('jiang_wei',15), rp('shu',5)] },
    { id: 'jiangwei_test', text: '강유를 시험한 후 등용', effects: [s('jiang_wei','intellect',3)] },
  ],
  'hist_229__2_': [
    { id: 'nb2_aggressive', text: '적극적으로 위나라 영토 공략', effects: [a('shu',-10000), a('wei',-8000)] },
    { id: 'nb2_cautious', text: '방어 거점 확보에 집중', effects: [a('shu',-5000), g('shu',-3000)] },
  ],
  'hist_230__3_': [
    { id: 'nb3_push', text: '위나라 깊숙이 진격', effects: [a('shu',-12000), a('wei',-10000)] },
    { id: 'nb3_defend', text: '기존 영토를 공고히 한다', effects: [a('shu',-5000)] },
  ],
  'hist_229/05/23__': [
    { id: 'wu_founding_ally', text: '오나라 건국을 축하하고 동맹 강화', effects: [r('liu_bei','sun_quan',10), rp('wu',10)] },
    { id: 'wu_founding_cold', text: '냉담하게 대한다', effects: [r('liu_bei','sun_quan',-5)] },
  ],
  'hist_238_gongsun_yuan_s_rebellion_suppressed': [
    { id: 'gongsun_quick', text: '속전속결로 진압', effects: [a('wei',-5000), rp('wei',5)] },
    { id: 'gongsun_negotiate', text: '협상으로 귀순시킨다', effects: [g('wei',5000)] },
  ],
  'hist_260_sima_zhao_assassinates_emperor_cao_mao': [
    { id: 'caomao_support', text: '황제를 지지하여 저항', effects: [a('wei',-5000), rp('wei',10)] },
    { id: 'caomao_sima', text: '사마소 편에 선다', effects: [rp('wei',-10)] },
  ],
  'hist_260/06/02__': [
    { id: 'caomao2_resist', text: '시해에 반대한다', effects: [rp('wei',10)] },
    { id: 'caomao2_accept', text: '현실을 수용한다', effects: [rp('wei',-5)] },
  ],
  'hist_265_western_jin_founded': [
    { id: 'jin_accept', text: '서진 건국을 인정한다', effects: [rp('wei',-10)] },
    { id: 'jin_resist', text: '끝까지 저항한다', effects: [a('wei',-10000)] },
  ],
  'hist_266/02/08__': [
    { id: 'jin_founding', text: '사마염이 진나라를 선포한다', effects: [rp('wei',-15)] },
    { id: 'jin_delay', text: '선양을 지연시킨다', effects: [a('wei',-5000)] },
  ],
  'hist_280_eastern_wu_falls_china_unified': [
    { id: 'wu_fall_fight', text: '오나라가 끝까지 저항', effects: [a('wu',-30000)] },
    { id: 'wu_fall_surrender', text: '오나라가 항복한다', effects: [g('wu',-20000)] },
  ],
  'hist_279-280__': [
    { id: 'conquest_swift', text: '전격전으로 오나라 정복', effects: [a('wei',-10000), a('wu',-20000)] },
    { id: 'conquest_gradual', text: '단계적으로 정복', effects: [a('wei',-5000), a('wu',-15000)] },
  ],
  'hist_184_zhang_lu_uprising': [
    { id: 'zl_resist', text: '장로의 거병에 대응', effects: [a('shu',-3000)] },
    { id: 'zl_ignore', text: '무시한다', effects: [] },
  ],
  'hist_187_han_sui_submits_to_han_court': [
    { id: 'hansui_accept', text: '한수의 귀순을 환영', effects: [rp('wei',5)] },
    { id: 'hansui_distrust', text: '한수를 의심한다', effects: [s('cao_cao','intellect',2)] },
  ],
  'hist_185_yang_zhou_uprisings_liu_yan_appointed': [
    { id: 'liuyan_support', text: '유언의 익주 부임을 지지', effects: [rp('shu',3)] },
    { id: 'liuyan_ignore', text: '관여하지 않는다', effects: [] },
  ],
  'hist_187_sun_ce_southern_conquest_begins': [
    { id: 'sunce_help', text: '손책의 남방 정복을 돕는다', effects: [r('liu_bei','sun_quan',5)] },
    { id: 'sunce_watch', text: '관망한다', effects: [] },
  ],

  // === 연의 이벤트들 ===
  'novel_ch2_환관_반란': [
    { id: 'eunuch_fight', text: '환관에 맞서 싸운다', effects: [a('shu',-2000), rp('shu',5)] },
    { id: 'eunuch_hide', text: '몸을 숨긴다', effects: [] },
  ],
  'novel_ch3_동탁_권력_장악': [
    { id: 'dz_oppose', text: '동탁에 반대한다', effects: [rp('shu',10), a('shu',-3000)] },
    { id: 'dz_comply', text: '동탁의 권력을 인정', effects: [rp('shu',-10)] },
  ],
  'novel_ch3_여포_정원_살해': [
    { id: 'dingyuan_save', text: '정원을 구하려 시도', effects: [a('shu',-2000)] },
    { id: 'dingyuan_watch', text: '관망한다', effects: [] },
  ],
  'novel_ch4_소제_폐위': [
    { id: 'shaodi_protest', text: '소제 폐위에 항의', effects: [rp('shu',10)] },
    { id: 'shaodi_silent', text: '침묵한다', effects: [] },
  ],
  'novel_ch4_헌제_즉위': [
    { id: 'xiandi_recognize', text: '헌제를 인정한다', effects: [rp('shu',5)] },
    { id: 'xiandi_doubt', text: '정통성을 의심한다', effects: [] },
  ],
  'novel_ch5_제후들의_반동탁_연합_결성': [
    { id: 'coalition_join', text: '연합군에 참여한다', effects: [rp('shu',10), a('shu',-3000)] },
    { id: 'coalition_refuse', text: '거절한다', effects: [rp('shu',-5)] },
  ],
  'novel_ch5_호뢰관_전투': [
    { id: 'hulao_3bros', text: '삼형제가 여포에 도전', effects: [s('liu_bei','charisma',3), a('shu',-2000)] },
    { id: 'hulao_assist', text: '후방 지원만 한다', effects: [a('shu',-1000)] },
  ],
  'novel_ch6_동탁이_낙양_불태움': [
    { id: 'luoyang_chase', text: '동탁을 추격한다', effects: [a('shu',-5000)] },
    { id: 'luoyang_save', text: '낙양 백성 구호에 집중', effects: [rp('shu',10), g('shu',-3000)] },
  ],
  'novel_ch6_장안으로_천도': [
    { id: 'changan_oppose', text: '천도에 반대한다', effects: [rp('shu',5)] },
    { id: 'changan_accept', text: '천도를 수용한다', effects: [] },
  ],
  'novel_ch8_왕윤이_초선을_이용한_이간계': [
    { id: 'diaochan_support', text: '왕윤의 계책을 돕는다', effects: [rp('shu',5)] },
    { id: 'diaochan_ignore', text: '관여하지 않는다', effects: [] },
  ],
  'novel_ch9_여포가_동탁_살해': [
    { id: 'dongzhuo_celebrate', text: '동탁의 죽음을 환영', effects: [rp('shu',5)] },
    { id: 'dongzhuo_cautious', text: '후속 혼란을 경계', effects: [s('liu_bei','intellect',2)] },
  ],
  'novel_ch10_이각과_곽사가_장안_장악': [
    { id: 'liguo_fight', text: '이각·곽사에 맞선다', effects: [a('shu',-5000), rp('shu',10)] },
    { id: 'liguo_avoid', text: '개입을 피한다', effects: [] },
  ],
  'novel_ch12_여포의_서주_침공': [
    { id: 'lubu_resist', text: '서주를 사수한다', effects: [a('shu',-8000)] },
    { id: 'lubu_yield', text: '서주를 양보한다', effects: [a('shu',-2000), rp('shu',-5)] },
  ],
  'novel_ch13_이각_곽사_충돌': [
    { id: 'liguo_mediate', text: '중재를 시도', effects: [rp('shu',5), s('liu_bei','politics',2)] },
    { id: 'liguo_exploit', text: '혼란을 이용한다', effects: [g('shu',5000)] },
  ],
  'novel_ch14_조조가_헌제를_허도로_옮기고_실권_장악': [
    { id: 'xuchang_oppose', text: '조조의 실권 장악에 반대', effects: [r('liu_bei','cao_cao',-10), rp('shu',5)] },
    { id: 'xuchang_cooperate', text: '조조와 협력한다', effects: [r('liu_bei','cao_cao',10)] },
  ],
  'novel_ch16_원술의_책략': [
    { id: 'yuanshu_counter', text: '원술의 계략에 맞대응', effects: [s('liu_bei','intellect',2)] },
    { id: 'yuanshu_endure', text: '참고 기회를 노린다', effects: [g('shu',3000)] },
  ],
  'novel_ch17_원술_스스로_황제_칭함': [
    { id: 'yuanshu_condemn', text: '원술의 참칭을 규탄', effects: [rp('shu',10)] },
    { id: 'yuanshu_ignore', text: '무시한다', effects: [] },
  ],
  'novel_ch18_조조와_장수의_전투': [
    { id: 'wancheng_aid', text: '장수를 돕는다', effects: [a('shu',-3000), r('liu_bei','cao_cao',-5)] },
    { id: 'wancheng_neutral', text: '중립을 유지한다', effects: [] },
  ],
  'novel_ch21_조조와_유비_술자리에서_영웅_논함': [
    { id: 'hero_honest', text: '솔직하게 포부를 밝힌다', effects: [s('liu_bei','charisma',3), r('liu_bei','cao_cao',-10)] },
    { id: 'hero_humble', text: '천둥 소리에 젓가락을 떨어뜨린다', effects: [s('liu_bei','intellect',3)] },
  ],
  'novel_ch23_예형이_벗은_채_북을_치며_조조_모욕': [
    { id: 'miheng_laugh', text: '예형의 기행에 박장대소', effects: [rp('shu',3)] },
    { id: 'miheng_scold', text: '예형을 꾸짖는다', effects: [rp('shu',-3)] },
  ],
  'novel_ch24_동승의_조조_암살_계획_발각': [
    { id: 'dongcheng_join', text: '밀조에 참여한다', effects: [r('liu_bei','cao_cao',-20), rp('shu',5)] },
    { id: 'dongcheng_flee', text: '서주로 도주한다', effects: [a('shu',-2000)] },
  ],
  'novel_ch26_관우가_원소의_장수_안량_격파': [
    { id: 'anliang_slay', text: '관우가 안량을 참수한다', effects: [s('guan_yu','war',3), s('guan_yu','charisma',5)] },
    { id: 'anliang_team', text: '관우와 장료가 합공한다', effects: [s('guan_yu','war',2), s('zhang_liao','war',2)] },
  ],
  'novel_ch27_관우_다섯_관문을_통과하며_여섯_장수를_베다': [
    { id: 'five_passes', text: '관우가 다섯 관문을 돌파', effects: [s('guan_yu','war',5), s('guan_yu','charisma',5)] },
    { id: 'five_negotiate', text: '협상으로 통과를 시도', effects: [s('guan_yu','politics',3)] },
  ],
  'novel_ch28_삼형제_재회': [
    { id: 'reunion_feast', text: '재회를 축하하며 연회', effects: [r('liu_bei','guan_yu',10), r('liu_bei','zhang_fei',10)] },
    { id: 'reunion_plan', text: '즉시 전략 회의에 돌입', effects: [s('liu_bei','command',2)] },
  ],
  'novel_ch30_조조가_원소를_관도에서_격파': [
    { id: 'guandu_exploit', text: '관도 승리를 틈타 확장', effects: [g('wei',10000)] },
    { id: 'guandu_consolidate', text: '내정에 집중한다', effects: [rp('wei',5)] },
  ],
  'novel_ch31_원소_가문_내분': [
    { id: 'yuan_exploit', text: '원씨 내분을 이용한다', effects: [g('wei',5000), s('cao_cao','intellect',2)] },
    { id: 'yuan_wait', text: '자멸을 기다린다', effects: [] },
  ],
  'novel_ch32_조조의_원씨_세력_토벌': [
    { id: 'yuan_total', text: '원씨를 완전히 토벌', effects: [a('wei',-10000), g('wei',15000)] },
    { id: 'yuan_partial', text: '일부만 토벌하고 귀순 수용', effects: [a('wei',-5000), g('wei',8000)] },
  ],
  'novel_ch33_조비가_원희의_아내_견씨_차지': [
    { id: 'zhenji_take', text: '조비가 견씨를 취한다', effects: [rp('wei',-5)] },
    { id: 'zhenji_refuse', text: '조비가 견씨를 거절', effects: [rp('wei',5)] },
  ],
  'novel_ch35_유비_사마휘를_만나_제갈량_방통_추천받음': [
    { id: 'shuijing_listen', text: '수경 선생의 추천을 믿는다', effects: [s('liu_bei','intellect',2)] },
    { id: 'shuijing_doubt', text: '산중 은사를 의심한다', effects: [] },
  ],
  'novel_ch36_서서가_유비_밑에서_활약_시작': [
    { id: 'xushu_trust', text: '서서에게 전권을 맡긴다', effects: [l('xu_shu',10)] },
    { id: 'xushu_test', text: '서서를 시험한다', effects: [s('xu_shu','intellect',2)] },
  ],
  'novel_ch38_제갈량_천하삼분지계_제시': [
    { id: 'longzhong_accept', text: '천하삼분지계를 채택', effects: [s('zhuge_liang','intellect',3), rp('shu',5)] },
    { id: 'longzhong_modify', text: '수정안을 제시한다', effects: [s('liu_bei','intellect',2)] },
  ],
  'novel_ch38_유비_제갈량_영입': [
    { id: 'zhuge_welcome', text: '제갈량을 군사로 맞이한다', effects: [l('zhuge_liang',15), rp('shu',10)] },
    { id: 'zhuge_advisor', text: '자문관으로 기용한다', effects: [l('zhuge_liang',5)] },
  ],
  'novel_ch39_제갈량의_첫_전략으로_조인_격파': [
    { id: 'first_win', text: '제갈량의 첫 승리를 축하', effects: [s('zhuge_liang','command',3), l('zhuge_liang',5)] },
    { id: 'first_cautious', text: '과신을 경계한다', effects: [s('liu_bei','intellect',2)] },
  ],
  'novel_ch41_장판에서_조운이_유선_구출': [
    { id: 'zhaoyun_rescue', text: '조운의 유선 구출을 칭송', effects: [s('zhao_yun','charisma',5), l('zhao_yun',10)] },
    { id: 'zhaoyun_scold', text: '위험한 행동을 꾸짖는다', effects: [l('zhao_yun',-5)] },
  ],
  'novel_ch42_장비_혼자_다리_위에서_조조군_저지': [
    { id: 'changban_bridge', text: '장비의 일기당천에 감탄', effects: [s('zhang_fei','charisma',5)] },
    { id: 'changban_reinforce', text: '장비에게 지원군을 보낸다', effects: [a('shu',-2000)] },
  ],
  'novel_ch43_제갈량_강동_유생들과_설전': [
    { id: 'debate_win', text: '제갈량이 강동 유생들을 논파', effects: [s('zhuge_liang','intellect',3), rp('wu',5)] },
    { id: 'debate_fail', text: '설전에 실패한다', effects: [rp('wu',-5)] },
  ],
  'novel_ch44_주유가_조조와의_전쟁_결심': [
    { id: 'zhouyu_war', text: '주유가 결전을 선언', effects: [s('zhou_yu','command',3), rp('wu',10)] },
    { id: 'zhouyu_hesitate', text: '주유가 망설인다', effects: [rp('wu',-5)] },
  ],
  'novel_ch45_조조가_보낸_장간이_주유에게_역이용됨': [
    { id: 'jianggan_trap', text: '장간이 역으로 속는다', effects: [s('zhou_yu','intellect',3)] },
    { id: 'jianggan_escape', text: '장간이 탈출한다', effects: [] },
  ],
  'novel_ch45_채모_장윤_살해_유도': [
    { id: 'caimao_kill', text: '채모/장윤이 처형된다', effects: [a('wei',-5000)] },
    { id: 'caimao_survive', text: '채모/장윤이 살아남는다', effects: [] },
  ],
  'novel_ch48_방통이_조조에게_배를_묶도록_유도': [
    { id: 'chain_ships', text: '연환계 — 조조 함대가 쇠사슬로 연결', effects: [s('pang_tong','intellect',3)] },
    { id: 'chain_refused', text: '조조가 의심하여 거절', effects: [] },
  ],
  'novel_ch49_제갈량_동남풍_기원': [
    { id: 'wind_success', text: '동남풍이 분다', effects: [s('zhuge_liang','intellect',5), rp('wu',10)] },
    { id: 'wind_fail', text: '바람이 오지 않는다', effects: [rp('wu',-10)] },
  ],
  'novel_ch49_황개_화공으로_조조_함대_전소': [
    { id: 'fire_total', text: '조조 함대 전소', effects: [a('wei',-50000), rp('wu',20)] },
    { id: 'fire_partial', text: '일부만 소실', effects: [a('wei',-20000), rp('wu',10)] },
  ],
  'novel_ch51_주유_남군_공략_시도': [
    { id: 'nanjun_zhouyu', text: '주유가 남군을 공략', effects: [a('wu',-5000)] },
    { id: 'nanjun_zhuge', text: '제갈량이 먼저 남군을 차지', effects: [rp('shu',5), r('zhou_yu','zhuge_liang',-10)] },
  ],
  'novel_ch53_황충과_위연이_유비에게_귀순': [
    { id: 'hz_wy_join', text: '황충과 위연을 환영한다', effects: [l('huang_zhong',10), l('wei_yan',10)] },
    { id: 'hz_wy_test', text: '충성을 시험한다', effects: [s('liu_bei','intellect',2)] },
  ],
  'novel_ch55_주유의_대촉_전략_실패': [
    { id: 'zhouyu_fail', text: '주유의 전략이 실패한다', effects: [rp('wu',-5)] },
    { id: 'zhouyu_succeed', text: '주유의 전략이 성공한다', effects: [rp('wu',10)] },
  ],
  'novel_ch56_제갈량이_주유를_분노케_함': [
    { id: 'zhuge_taunt', text: '제갈량이 주유를 도발', effects: [r('zhou_yu','zhuge_liang',-15)] },
    { id: 'zhuge_calm', text: '제갈량이 화해를 시도', effects: [r('zhou_yu','zhuge_liang',5)] },
  ],
  'novel_ch57_방통이_유비에게_합류': [
    { id: 'pangtong_join', text: '방통을 부군사에 임명', effects: [l('pang_tong',10), rp('shu',5)] },
    { id: 'pangtong_lowpost', text: '방통에게 말단직을 준다', effects: [l('pang_tong',-10)] },
  ],
  'novel_ch58_마등_처형': [
    { id: 'mateng_mourn', text: '마등의 처형을 애도한다', effects: [rp('shu',5)] },
    { id: 'mateng_silent', text: '침묵한다', effects: [] },
  ],
  'novel_ch59_마초의_맹렬한_공격': [
    { id: 'machao_fierce', text: '마초가 맹공격', effects: [a('wei',-15000), s('ma_chao','war',3)] },
    { id: 'machao_strategic', text: '전략적으로 공격', effects: [a('wei',-10000), a('shu',-3000)] },
  ],
  'novel_ch61_손상향이_유선을_데려가려_시도': [
    { id: 'sunren_stop', text: '조운이 유선을 지킨다', effects: [s('zhao_yun','charisma',3)] },
    { id: 'sunren_allow', text: '손상향의 행동을 허락', effects: [r('liu_bei','sun_quan',5)] },
  ],
  'novel_ch64_마초_유비에_귀순': [
    { id: 'machao_welcome', text: '마초를 선봉장에 임명', effects: [l('ma_chao',10), a('shu',5000)] },
    { id: 'machao_caution', text: '마초의 충성을 시험', effects: [l('ma_chao',5)] },
  ],
  'novel_ch65_유장_항복': [
    { id: 'liuzhang_accept', text: '유장의 항복을 수락', effects: [g('shu',20000), rp('shu',5)] },
    { id: 'liuzhang_exile', text: '유장을 유배한다', effects: [g('shu',15000), rp('shu',-5)] },
  ],
  'novel_ch65_유비_익주_차지': [
    { id: 'yizhou_develop', text: '익주를 즉시 개발', effects: [g('shu',-10000), rp('shu',10)] },
    { id: 'yizhou_military', text: '군사력 증강에 집중', effects: [a('shu',10000), g('shu',-5000)] },
  ],
  'novel_ch67_합비_공방전_지속': [
    { id: 'hefei2_persist', text: '합비 공격 지속', effects: [a('wu',-8000), a('wei',-5000)] },
    { id: 'hefei2_withdraw', text: '철수한다', effects: [a('wu',-3000)] },
  ],
  'novel_ch70_유비_한중_원정_시작': [
    { id: 'hanzhong_full', text: '전력 투입', effects: [a('shu',-10000), g('shu',-10000)] },
    { id: 'hanzhong_probe', text: '소규모 선발대 투입', effects: [a('shu',-5000), g('shu',-5000)] },
  ],
  'novel_ch70_장비_장합_격파': [
    { id: 'zhangfei_charge', text: '장비가 장합을 격파', effects: [s('zhang_fei','war',3), a('wei',-5000)] },
    { id: 'zhangfei_ambush', text: '매복전으로 격파', effects: [s('zhang_fei','intellect',3), a('wei',-5000)] },
  ],
  'novel_ch72_조조_한중_철수': [
    { id: 'caocao_retreat', text: '조조가 한중에서 철수', effects: [g('shu',5000)] },
    { id: 'caocao_delay', text: '조조가 지연전을 벌인다', effects: [a('shu',-5000)] },
  ],
  'novel_ch72_유비_한중_확보': [
    { id: 'hanzhong_fortify', text: '한중을 요새화한다', effects: [g('shu',-8000), a('shu',5000)] },
    { id: 'hanzhong_expand', text: '한중에서 북진 시도', effects: [a('shu',-8000)] },
  ],
  'novel_ch73_유비_한중왕_선언': [
    { id: 'king_ceremony', text: '성대한 즉위식', effects: [rp('shu',15), g('shu',-5000)] },
    { id: 'king_humble', text: '검소하게 즉위', effects: [rp('shu',10)] },
  ],
  'novel_ch73_관우_양양_공격_시작': [
    { id: 'xiangyang_attack', text: '관우가 양양을 공격', effects: [a('shu',-5000), a('wei',-5000)] },
    { id: 'xiangyang_defend', text: '형주 방어에 집중', effects: [a('shu',-2000)] },
  ],
  'novel_ch74_방덕이_관우와_대결': [
    { id: 'pangde_duel', text: '방덕과 관우의 일기토', effects: [s('guan_yu','war',2)] },
    { id: 'pangde_avoid', text: '일기토를 회피', effects: [] },
  ],
  'novel_ch74_우금_투항': [
    { id: 'yujin_accept', text: '우금의 투항을 받아들인다', effects: [a('shu',5000)] },
    { id: 'yujin_reject', text: '우금을 포로로 가둔다', effects: [rp('shu',-3)] },
  ],
  'novel_ch75_화타가_관우의_팔뼈를_긁어_독_제거': [
    { id: 'huatuo_treat', text: '관우가 바둑을 두며 수술 받는다', effects: [s('guan_yu','charisma',5)] },
    { id: 'huatuo_refuse', text: '수술을 거절한다', effects: [s('guan_yu','war',-3)] },
  ],
  'novel_ch77_관우의_혼령_출현': [
    { id: 'ghost_honor', text: '관우의 영혼에 제를 올린다', effects: [rp('shu',5)] },
    { id: 'ghost_ignore', text: '미신으로 치부한다', effects: [] },
  ],
  'novel_ch78_조조가_화타_처형': [
    { id: 'huatuo_execute', text: '화타를 처형한다', effects: [rp('wei',-10)] },
    { id: 'huatuo_free', text: '화타를 석방한다', effects: [rp('wei',5)] },
  ],
  'novel_ch79_칠보시': [
    { id: 'qibushi_pass', text: '조식이 칠보시를 읊어 살아남는다', effects: [rp('wei',3)] },
    { id: 'qibushi_fail', text: '조식이 시를 짓지 못한다', effects: [rp('wei',-5)] },
  ],
  'novel_ch80_조비_위나라_건국': [
    { id: 'wei_found', text: '선양을 받아 위나라 건국', effects: [rp('wei',10)] },
    { id: 'wei_resist', text: '충신들이 저항', effects: [a('wei',-5000)] },
  ],
  'novel_ch80_유비_촉한_건국_선언': [
    { id: 'shu_found', text: '촉한 건국을 선포', effects: [rp('shu',15)] },
    { id: 'shu_postpone', text: '건국을 미룬다', effects: [g('shu',5000)] },
  ],
  'novel_ch84_육손이_제갈량의_팔진도에_갇힘': [
    { id: 'bazhetu_trap', text: '육손이 팔진도에 갇힌다', effects: [s('zhuge_liang','intellect',3)] },
    { id: 'bazhetu_escape', text: '육손이 탈출한다', effects: [s('lu_xun','intellect',3)] },
  ],
  'novel_ch84_유비_퇴각': [
    { id: 'retreat_baidicheng', text: '백제성으로 퇴각', effects: [a('shu',-10000)] },
    { id: 'retreat_chengdu', text: '성도로 직접 퇴각', effects: [a('shu',-5000), g('shu',-5000)] },
  ],
  'novel_ch85_제갈량에게_후사_부탁': [
    { id: 'takgo_full', text: '제갈량에게 전권 위임', effects: [l('zhuge_liang',20)] },
    { id: 'takgo_shared', text: '여러 대신에게 분산', effects: [l('zhuge_liang',5)] },
  ],
  'novel_ch86_조비의_오나라_원정_실패': [
    { id: 'caopi_fail', text: '조비의 원정이 실패', effects: [a('wei',-15000), rp('wei',-5)] },
    { id: 'caopi_partial', text: '일부 전과를 올린다', effects: [a('wei',-8000)] },
  ],
  'novel_ch88_맹획_2_3차_포획_및_석방': [
    { id: 'menghuo_release23', text: '맹획을 또 풀어준다', effects: [rp('shu',5), s('zhuge_liang','charisma',2)] },
    { id: 'menghuo_hold23', text: '이번에는 가둔다', effects: [a('shu',-3000)] },
  ],
  'novel_ch89_맹획_4_5차_포획_및_석방': [
    { id: 'menghuo_release45', text: '맹획을 계속 풀어준다', effects: [rp('shu',5)] },
    { id: 'menghuo_hold45', text: '다섯 번째에 가둔다', effects: [a('shu',-3000)] },
  ],
  'novel_ch90_축융부인_등장': [
    { id: 'zhurong_fight', text: '축융부인과 교전', effects: [a('shu',-3000)] },
    { id: 'zhurong_capture', text: '축융부인을 사로잡는다', effects: [s('zhuge_liang','command',2)] },
  ],
  'novel_ch91_제갈량_출사표_상주': [
    { id: 'csb_accept', text: '출사표를 받아들인다', effects: [rp('shu',10)] },
    { id: 'csb_reluctant', text: '마지못해 허락', effects: [l('zhuge_liang',-5)] },
  ],
  'novel_ch91_북벌_개시': [
    { id: 'nb1_full', text: '전력 투입', effects: [a('shu',20000), g('shu',-15000)] },
    { id: 'nb1_limited', text: '소규모 원정', effects: [a('shu',10000), g('shu',-8000)] },
  ],
  'novel_ch92_강유가_제갈량에_합류': [
    { id: 'jw_welcome', text: '강유를 환영한다', effects: [l('jiang_wei',15)] },
    { id: 'jw_cautious', text: '강유를 경계한다', effects: [l('jiang_wei',5)] },
  ],
  'novel_ch93_제갈량이_왕랑을_말로_죽임': [
    { id: 'wanglang_die', text: '왕랑이 분사한다', effects: [s('zhuge_liang','charisma',5), rp('shu',10)] },
    { id: 'wanglang_survive', text: '왕랑이 살아남는다', effects: [] },
  ],
  'novel_ch96_마속_군법으로_처형': [
    { id: 'masu_execute', text: '마속을 군법으로 처형 — 읍참마속', effects: [rp('shu',5), s('zhuge_liang','command',2)] },
    { id: 'masu_spare', text: '마속을 살려준다', effects: [rp('shu',-5), l('ma_su',10)] },
  ],
  'novel_ch97_제갈량_2차_북벌_개시': [
    { id: 'nb2_start', text: '제2차 북벌 개시', effects: [a('shu',15000), g('shu',-10000)] },
    { id: 'nb2_delay', text: '준비가 더 필요하다', effects: [g('shu',5000)] },
  ],
  'novel_ch98_계속되는_위_촉_공방전': [
    { id: 'nb3_push2', text: '공격적으로 밀어붙인다', effects: [a('shu',-10000), a('wei',-8000)] },
    { id: 'nb3_hold2', text: '방어적으로 대응', effects: [a('shu',-5000)] },
  ],
  'novel_ch99_계속되는_북벌_전쟁': [
    { id: 'nb4_continue', text: '북벌을 계속한다', effects: [a('shu',-10000), a('wei',-8000)] },
    { id: 'nb4_rest', text: '병사들을 쉬게 한다', effects: [g('shu',5000)] },
  ],
  'novel_ch100_제갈량과_사마의의_치열한_두뇌전': [
    { id: 'brain_attack', text: '공격적으로 교전', effects: [a('shu',-8000), a('wei',-8000)] },
    { id: 'brain_outsmart', text: '심리전으로 압박', effects: [s('zhuge_liang','intellect',2)] },
  ],
  'novel_ch102_제갈량_목우유마_수레_발명': [
    { id: 'woodox_deploy', text: '목우유마를 보급에 투입', effects: [g('shu',5000)] },
    { id: 'woodox_trap', text: '목우유마로 위군을 함정에 빠트린다', effects: [a('wei',-5000)] },
  ],
  'novel_ch102_위_촉_공방전_지속': [
    { id: 'nb5_offense', text: '제5차 북벌 공세', effects: [a('shu',-10000), a('wei',-10000)] },
    { id: 'nb5_defense', text: '방어전에 집중', effects: [a('shu',-5000)] },
  ],
  'novel_ch104_사마의_퇴각_죽은_공명이_산_중달을_쫓다_': [
    { id: 'dead_chase', text: '죽은 공명의 위엄으로 사마의 퇴각', effects: [rp('shu',10)] },
    { id: 'dead_nochase', text: '사마의가 추격한다', effects: [a('shu',-5000)] },
  ],
  'novel_ch105_마대에게_참수됨': [
    { id: 'weiyan_execute', text: '위연을 처단한다', effects: [rp('shu',-5)] },
    { id: 'weiyan_spare2', text: '위연을 사면한다', effects: [l('wei_yan',10)] },
  ],
  'novel_ch106_공손연_반란_진압': [
    { id: 'gongsun2_crush', text: '반란을 무력 진압', effects: [a('wei',-5000)] },
    { id: 'gongsun2_negotiate', text: '협상으로 해결', effects: [g('wei',5000)] },
  ],
  'novel_ch106_사마의_조위_실권_장악': [
    { id: 'sima_power', text: '사마의가 실권을 장악', effects: [s('sima_yi','politics',5)] },
    { id: 'sima_resist', text: '조위 신하들이 저항', effects: [a('wei',-5000)] },
  ],
  'novel_ch107_사마의_쿠데타_성공': [
    { id: 'coup_total', text: '사마의가 완전히 권력 장악', effects: [rp('wei',-10)] },
    { id: 'coup_partial', text: '일부 저항 세력 잔존', effects: [a('wei',-5000)] },
  ],
  'novel_ch109_사마사_조방_폐위': [
    { id: 'simashi_depose', text: '사마사가 조방을 폐위', effects: [rp('wei',-10)] },
    { id: 'simashi_fail', text: '폐위 시도 실패', effects: [a('wei',-5000)] },
  ],
  'novel_ch110_관구검과_문흠의_반란': [
    { id: 'guanqiu_crush', text: '반란을 진압', effects: [a('wei',-5000)] },
    { id: 'guanqiu_join', text: '반란에 가담', effects: [a('wei',-8000), rp('wei',-10)] },
  ],
  'novel_ch112_제갈탄의_반위_반란': [
    { id: 'zhugedan_fight', text: '제갈탄의 반란에 대응', effects: [a('wei',-8000)] },
    { id: 'zhugedan_support', text: '제갈탄을 지원한다', effects: [a('wei',-5000)] },
  ],
  'novel_ch113_강유의_계속되는_전쟁': [
    { id: 'jw_continue', text: '강유의 북벌을 지지', effects: [a('shu',-8000)] },
    { id: 'jw_stop', text: '북벌 중단을 명한다', effects: [g('shu',5000)] },
  ],
  'novel_ch114_강유_전쟁_지속': [
    { id: 'jw_persist', text: '전쟁을 계속한다', effects: [a('shu',-10000)] },
    { id: 'jw_retreat', text: '철수한다', effects: [a('shu',-3000)] },
  ],
  'novel_ch115_환관_황호의_간섭으로_약화': [
    { id: 'huanghao_purge', text: '황호를 축출한다', effects: [rp('shu',10)] },
    { id: 'huanghao_tolerate', text: '황호를 방치한다', effects: [rp('shu',-10)] },
  ],
  'novel_ch116_한중_함락': [
    { id: 'hanzhong_defend', text: '한중을 사수한다', effects: [a('shu',-10000), a('wei',-8000)] },
    { id: 'hanzhong_retreat', text: '한중을 포기한다', effects: [a('shu',-5000)] },
  ],
  'novel_ch118_강유가_종회와_함께_반란_시도_실패': [
    { id: 'jw_rebellion', text: '강유가 반란을 시도', effects: [a('shu',-10000)] },
    { id: 'jw_surrender', text: '순순히 항복한다', effects: [rp('shu',-10)] },
  ],
  'novel_ch119_사마염_조환에게서_선양': [
    { id: 'jin_accept2', text: '선양을 수용', effects: [rp('wei',-15)] },
    { id: 'jin_refuse2', text: '선양을 거부', effects: [a('wei',-10000)] },
  ],
  'novel_ch119_진나라_건국': [
    { id: 'jin_found', text: '진나라를 건국한다', effects: [rp('wei',-15)] },
    { id: 'jin_delay2', text: '건국을 미룬다', effects: [] },
  ],
  'novel_ch120_양호와_육항의_대결과_우정': [
    { id: 'yanghu_respect', text: '적장에게 예를 갖춘다', effects: [s('yang_hu','charisma',5)] },
    { id: 'yanghu_war', text: '전면전을 벌인다', effects: [a('wu',-5000), a('wei',-5000)] },
  ],
  'novel_ch120_진나라_오나라_정복': [
    { id: 'wu_conquer', text: '오나라를 정복한다', effects: [a('wu',-30000)] },
    { id: 'wu_negotiate', text: '오나라와 협상', effects: [g('wei',10000)] },
  ],
  'novel_ch120_삼국_통일': [
    { id: 'unity_celebrate', text: '천하통일을 축하한다', effects: [rp('wei',20)] },
    { id: 'unity_mourn', text: '전란의 희생을 추모한다', effects: [rp('wei',10)] },
  ],
  // 초자연
  'novel_ch68_도사_좌자의_기행': [
    { id: 'zuoci_listen', text: '좌자의 말을 경청한다', effects: [s('cao_cao','intellect',2)] },
    { id: 'zuoci_chase', text: '좌자를 잡으려 한다', effects: [rp('wei',-3)] },
  ],
  'novel_ch69_관로의_예언과_초자연적_사건': [
    { id: 'guanlu_believe', text: '관로의 예언을 믿는다', effects: [s('cao_cao','intellect',2)] },
    { id: 'guanlu_dismiss', text: '미신으로 일축한다', effects: [] },
  ],
  'novel_ch104_오장원에서_사망': [
    { id: 'wuzhang_die', text: '제갈량이 오장원에서 별세', effects: [rp('shu',-15)] },
    { id: 'wuzhang_miracle', text: '제갈량이 기적적으로 회복', effects: [s('zhuge_liang','intellect',5)] },
  ],
  'novel_ch114_사마소가_조모_시해': [
    { id: 'caomao_kill', text: '사마소가 조모를 시해', effects: [rp('wei',-15)] },
    { id: 'caomao_save', text: '조모가 살아남는다', effects: [rp('wei',5)] },
  ],
  'novel_ch81_장비_부하에_의해_살해됨': [
    { id: 'fei_killed', text: '장비가 부하에게 살해된다', effects: [rp('shu',-10), a('shu',-5000)] },
    { id: 'fei_survives', text: '장비가 암살을 피한다', effects: [s('zhang_fei','intellect',3)] },
  ],
};

// 적용
let patched = 0;
for (const ev of data.events) {
  if (C[ev.id] && (!ev.choices || ev.choices.length === 0)) {
    ev.choices = C[ev.id];
    patched++;
  }
}

console.log(`Patched: ${patched} events`);
console.log(`Total multi-choice: ${data.events.filter(e=>e.choices?.length>1).length}`);
console.log(`Remaining no-choice: ${data.events.filter(e=>!e.choices||e.choices.length===0).length}`);

writeFileSync(FILE, JSON.stringify(data, null, 2));
