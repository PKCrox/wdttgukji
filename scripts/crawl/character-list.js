/**
 * Tier 0-1 캐릭터 데이터베이스
 * KR ↔ EN ↔ CN 이름 매핑 + 나무위키 URL + 팩션 + 티어
 *
 * Tier 0 (20명): 수작업 soul.md — 핵심 인물
 * Tier 1 (60명): AI + 검수 soul.md — 주요 인물
 */

/** @typedef {{ name_kr: string, name_en: string, name_cn: string, courtesy_kr?: string, courtesy_cn?: string, namu_title: string, faction: string, tier: 0|1, role: string }} Character */

/** @type {Character[]} */
export const TIER_0 = [
  // ── 위(魏) ──
  { name_kr: '조조', name_en: 'Cao Cao', name_cn: '曹操', courtesy_kr: '맹덕', courtesy_cn: '孟德', namu_title: '조조', faction: 'wei', tier: 0, role: '위 건국자, 최종보스' },
  { name_kr: '사마의', name_en: 'Sima Yi', name_cn: '司馬懿', courtesy_kr: '중달', courtesy_cn: '仲達', namu_title: '사마의', faction: 'wei', tier: 0, role: '위 중신 → 진 건국 기반' },
  { name_kr: '순욱', name_en: 'Xun Yu', name_cn: '荀彧', courtesy_kr: '문약', courtesy_cn: '文若', namu_title: '순욱', faction: 'wei', tier: 0, role: '조조의 왕좌창(王佐之才)' },
  { name_kr: '곽가', name_en: 'Guo Jia', name_cn: '郭嘉', courtesy_kr: '봉효', courtesy_cn: '奉孝', namu_title: '곽가', faction: 'wei', tier: 0, role: '조조 최측근 참모, 요절' },
  { name_kr: '하후돈', name_en: 'Xiahou Dun', name_cn: '夏侯惇', courtesy_kr: '원양', courtesy_cn: '元讓', namu_title: '하후돈', faction: 'wei', tier: 0, role: '조조 혈족 맹장' },
  { name_kr: '장료', name_en: 'Zhang Liao', name_cn: '張遼', courtesy_kr: '문원', courtesy_cn: '文遠', namu_title: '장료', faction: 'wei', tier: 0, role: '합비 수비, 오국 무쌍' },

  // ── 촉(蜀) ──
  { name_kr: '유비', name_en: 'Liu Bei', name_cn: '劉備', courtesy_kr: '현덕', courtesy_cn: '玄德', namu_title: '유비', faction: 'shu', tier: 0, role: '촉한 건국자, 주인공' },
  { name_kr: '관우', name_en: 'Guan Yu', name_cn: '關羽', courtesy_kr: '운장', courtesy_cn: '雲長', namu_title: '관우', faction: 'shu', tier: 0, role: '무성(武聖), 의리의 상징' },
  { name_kr: '장비', name_en: 'Zhang Fei', name_cn: '張飛', courtesy_kr: '익덕', courtesy_cn: '翼德', namu_title: '장비', faction: 'shu', tier: 0, role: '용맹, 장판교의 사나이' },
  { name_kr: '제갈량', name_en: 'Zhuge Liang', name_cn: '諸葛亮', courtesy_kr: '공명', courtesy_cn: '孔明', namu_title: '제갈량', faction: 'shu', tier: 0, role: '만능 참모, 삼고초려의 주인공' },
  { name_kr: '조운', name_en: 'Zhao Yun', name_cn: '趙雲', courtesy_kr: '자룡', courtesy_cn: '子龍', namu_title: '조운', faction: 'shu', tier: 0, role: '상산의 조자룡, 완벽한 장수' },

  // ── 오(吳) ──
  { name_kr: '손권', name_en: 'Sun Quan', name_cn: '孫權', courtesy_kr: '중모', courtesy_cn: '仲謀', namu_title: '손권', faction: 'wu', tier: 0, role: '오 건국자' },
  { name_kr: '주유', name_en: 'Zhou Yu', name_cn: '周瑜', courtesy_kr: '공근', courtesy_cn: '公瑾', namu_title: '주유(삼국지)', faction: 'wu', tier: 0, role: '적벽대전의 총사령관' },
  { name_kr: '손견', name_en: 'Sun Jian', name_cn: '孫堅', courtesy_kr: '문대', courtesy_cn: '文臺', namu_title: '손견', faction: 'wu', tier: 0, role: '강동의 호랑이' },
  { name_kr: '손책', name_en: 'Sun Ce', name_cn: '孫策', courtesy_kr: '백부', courtesy_cn: '伯符', namu_title: '손책', faction: 'wu', tier: 0, role: '소패왕, 강동 정복' },

  // ── 기타 ──
  { name_kr: '여포', name_en: 'Lu Bu', name_cn: '呂布', courtesy_kr: '봉선', courtesy_cn: '奉先', namu_title: '여포', faction: 'other', tier: 0, role: '최강 무장, 배신의 아이콘' },
  { name_kr: '동탁', name_en: 'Dong Zhuo', name_cn: '董卓', courtesy_kr: '중영', courtesy_cn: '仲穎', namu_title: '동탁', faction: 'other', tier: 0, role: '폭군, 난세의 시작' },
  { name_kr: '초선', name_en: 'Diao Chan', name_cn: '貂蟬', namu_title: '초선', faction: 'other', tier: 0, role: '연의 4대 미녀, 연환계' },
  { name_kr: '원소', name_en: 'Yuan Shao', name_cn: '袁紹', courtesy_kr: '본초', courtesy_cn: '本初', namu_title: '원소', faction: 'other', tier: 0, role: '하북 맹주, 관도대전' },
  { name_kr: '가후', name_en: 'Jia Xu', name_cn: '賈詡', courtesy_kr: '문화', courtesy_cn: '文和', namu_title: '가후', faction: 'wei', tier: 0, role: '독사 참모, 생존의 귀재' },
];

/** @type {Character[]} */
export const TIER_1 = [
  // ── 위 ──
  { name_kr: '하후연', name_en: 'Xiahou Yuan', name_cn: '夏侯淵', courtesy_kr: '묘재', courtesy_cn: '妙才', namu_title: '하후연', faction: 'wei', tier: 1, role: '기동 전술 명장' },
  { name_kr: '장합', name_en: 'Zhang He', name_cn: '張郃', courtesy_kr: '준예', courtesy_cn: '儁乂', namu_title: '장합', faction: 'wei', tier: 1, role: '가정 전투 수훈' },
  { name_kr: '서황', name_en: 'Xu Huang', name_cn: '徐晃', courtesy_kr: '공명', courtesy_cn: '公明', namu_title: '서황', faction: 'wei', tier: 1, role: '번성 구원, 주아부 재현' },
  { name_kr: '악진', name_en: 'Yue Jin', name_cn: '樂進', courtesy_kr: '문겸', courtesy_cn: '文謙', namu_title: '악진', faction: 'wei', tier: 1, role: '선등 장수' },
  { name_kr: '우금', name_en: 'Yu Jin', name_cn: '于禁', courtesy_kr: '문칙', courtesy_cn: '文則', namu_title: '우금', faction: 'wei', tier: 1, role: '군율의 화신, 번성 항복' },
  { name_kr: '전위', name_en: 'Dian Wei', name_cn: '典韋', namu_title: '전위(삼국지)', faction: 'wei', tier: 1, role: '조조의 근위대장, 완성 전사' },
  { name_kr: '허저', name_en: 'Xu Chu', name_cn: '許褚', courtesy_kr: '중강', courtesy_cn: '仲康', namu_title: '허저', faction: 'wei', tier: 1, role: '호치(虎癡), 조조 호위' },
  { name_kr: '조인', name_en: 'Cao Ren', name_cn: '曹仁', courtesy_kr: '자효', courtesy_cn: '子孝', namu_title: '조인', faction: 'wei', tier: 1, role: '수비 전문, 번성' },
  { name_kr: '조비', name_en: 'Cao Pi', name_cn: '曹丕', courtesy_kr: '자환', courtesy_cn: '子桓', namu_title: '조비', faction: 'wei', tier: 1, role: '위 초대 황제' },
  { name_kr: '방덕', name_en: 'Pang De', name_cn: '龐德', courtesy_kr: '영명', courtesy_cn: '令明', namu_title: '방덕', faction: 'wei', tier: 1, role: '관우전 선봉, 충절' },
  { name_kr: '서서', name_en: 'Xu Shu', name_cn: '徐庶', courtesy_kr: '원직', courtesy_cn: '元直', namu_title: '서서', faction: 'wei', tier: 1, role: '촉→위 이적, 효자' },
  { name_kr: '종회', name_en: 'Zhong Hui', name_cn: '鍾會', courtesy_kr: '사계', courtesy_cn: '士季', namu_title: '종회', faction: 'wei', tier: 1, role: '촉한 멸망 주도' },
  { name_kr: '등애', name_en: 'Deng Ai', name_cn: '鄧艾', courtesy_kr: '사재', courtesy_cn: '士載', namu_title: '등애', faction: 'wei', tier: 1, role: '음평 기습, 촉한 멸망' },
  { name_kr: '순공달', name_en: 'Xun Gongda', name_cn: '荀攸', courtesy_kr: '공달', courtesy_cn: '公達', namu_title: '순유', faction: 'wei', tier: 1, role: '순욱 조카, 모사' },
  { name_kr: '문앙', name_en: 'Wen Yang', name_cn: '文鴦', namu_title: '문앙', faction: 'wei', tier: 1, role: '후기 맹장' },

  // ── 촉 ──
  { name_kr: '마초', name_en: 'Ma Chao', name_cn: '馬超', courtesy_kr: '맹기', courtesy_cn: '孟起', namu_title: '마초', faction: 'shu', tier: 1, role: '서량의 맹장, 오호대장군' },
  { name_kr: '황충', name_en: 'Huang Zhong', name_cn: '黃忠', courtesy_kr: '한승', courtesy_cn: '漢升', namu_title: '황충', faction: 'shu', tier: 1, role: '노익장, 정군산' },
  { name_kr: '위연', name_en: 'Wei Yan', name_cn: '魏延', courtesy_kr: '문장', courtesy_cn: '文長', namu_title: '위연', faction: 'shu', tier: 1, role: '맹장, 반골의 낙인' },
  { name_kr: '방통', name_en: 'Pang Tong', name_cn: '龐統', courtesy_kr: '사원', courtesy_cn: '士元', namu_title: '방통', faction: 'shu', tier: 1, role: '봉추, 낙봉파 전사' },
  { name_kr: '마량', name_en: 'Ma Liang', name_cn: '馬良', courtesy_kr: '계상', courtesy_cn: '季常', namu_title: '마량', faction: 'shu', tier: 1, role: '백미, 이릉 전사' },
  { name_kr: '마속', name_en: 'Ma Su', name_cn: '馬謖', courtesy_kr: '유상', courtesy_cn: '幼常', namu_title: '마속', faction: 'shu', tier: 1, role: '가정 참패, 읍참마속' },
  { name_kr: '법정', name_en: 'Fa Zheng', name_cn: '法正', courtesy_kr: '효직', courtesy_cn: '孝直', namu_title: '법정(삼국지)', faction: 'shu', tier: 1, role: '유비 입촉 공신' },
  { name_kr: '강유', name_en: 'Jiang Wei', name_cn: '姜維', courtesy_kr: '백약', courtesy_cn: '伯約', namu_title: '강유', faction: 'shu', tier: 1, role: '제갈량 후계, 9차 북벌' },
  { name_kr: '유선', name_en: 'Liu Shan', name_cn: '劉禪', courtesy_kr: '공사', courtesy_cn: '公嗣', namu_title: '유선(삼국지)', faction: 'shu', tier: 1, role: '촉한 2대 황제, 아두' },
  { name_kr: '관흥', name_en: 'Guan Xing', name_cn: '關興', namu_title: '관흥', faction: 'shu', tier: 1, role: '관우의 아들' },
  { name_kr: '장포', name_en: 'Zhang Bao', name_cn: '張苞', namu_title: '장포', faction: 'shu', tier: 1, role: '장비의 아들' },
  { name_kr: '이엄', name_en: 'Li Yan', name_cn: '李嚴', courtesy_kr: '정방', courtesy_cn: '正方', namu_title: '이엄(삼국지)', faction: 'shu', tier: 1, role: '유비 탁고, 제갈량과 갈등' },

  // ── 오 ──
  { name_kr: '노숙', name_en: 'Lu Su', name_cn: '魯肅', courtesy_kr: '자경', courtesy_cn: '子敬', namu_title: '노숙', faction: 'wu', tier: 1, role: '적벽 외교, 유비 연합 주도' },
  { name_kr: '여몽', name_en: 'Lu Meng', name_cn: '呂蒙', courtesy_kr: '자명', courtesy_cn: '子明', namu_title: '여몽', faction: 'wu', tier: 1, role: '오하아몽, 형주 탈환' },
  { name_kr: '육손', name_en: 'Lu Xun', name_cn: '陸遜', courtesy_kr: '백언', courtesy_cn: '伯言', namu_title: '육손', faction: 'wu', tier: 1, role: '이릉대전 승리' },
  { name_kr: '감녕', name_en: 'Gan Ning', name_cn: '甘寧', courtesy_kr: '흥패', courtesy_cn: '興霸', namu_title: '감녕', faction: 'wu', tier: 1, role: '수적→맹장, 백기기습' },
  { name_kr: '주태', name_en: 'Zhou Tai', name_cn: '周泰', courtesy_kr: '유평', courtesy_cn: '幼平', namu_title: '주태', faction: 'wu', tier: 1, role: '손권 근위, 흉터 장수' },
  { name_kr: '태사자', name_en: 'Taishi Ci', name_cn: '太史慈', courtesy_kr: '자의', courtesy_cn: '子義', namu_title: '태사자', faction: 'wu', tier: 1, role: '효자 장수, 손책과 일기토' },
  { name_kr: '황개', name_en: 'Huang Gai', name_cn: '黃蓋', courtesy_kr: '공복', courtesy_cn: '公覆', namu_title: '황개', faction: 'wu', tier: 1, role: '고육지계, 적벽 화공' },
  { name_kr: '감택', name_en: 'Kan Ze', name_cn: '闞澤', courtesy_kr: '덕윤', courtesy_cn: '德潤', namu_title: '감택', faction: 'wu', tier: 1, role: '항서 전달, 문인' },
  { name_kr: '대교', name_en: 'Da Qiao', name_cn: '大喬', namu_title: '대교(삼국지)', faction: 'wu', tier: 1, role: '손책의 부인' },
  { name_kr: '소교', name_en: 'Xiao Qiao', name_cn: '小喬', namu_title: '소교(삼국지)', faction: 'wu', tier: 1, role: '주유의 부인' },
  { name_kr: '손상향', name_en: 'Sun Shangxiang', name_cn: '孫尚香', namu_title: '손부인', faction: 'wu', tier: 1, role: '유비의 부인, 여장군' },

  // ── 기타 세력 ──
  { name_kr: '원술', name_en: 'Yuan Shu', name_cn: '袁術', courtesy_kr: '공로', courtesy_cn: '公路', namu_title: '원술', faction: 'other', tier: 1, role: '자칭 황제, 원소 형제' },
  { name_kr: '진궁', name_en: 'Chen Gong', name_cn: '陳宮', courtesy_kr: '공대', courtesy_cn: '公臺', namu_title: '진궁', faction: 'other', tier: 1, role: '여포의 참모' },
  { name_kr: '장각', name_en: 'Zhang Jiao', name_cn: '張角', namu_title: '장각', faction: 'other', tier: 1, role: '황건적 수장' },
  { name_kr: '이유', name_en: 'Li Ru', name_cn: '李儒', namu_title: '이유(삼국지)', faction: 'other', tier: 1, role: '동탁의 참모' },
  { name_kr: '유표', name_en: 'Liu Biao', name_cn: '劉表', courtesy_kr: '경승', courtesy_cn: '景升', namu_title: '유표', faction: 'other', tier: 1, role: '형주 목사' },
  { name_kr: '장수', name_en: 'Zhang Xiu', name_cn: '張繡', namu_title: '장수(삼국지)', faction: 'other', tier: 1, role: '완성 전투, 전위 살해' },
  { name_kr: '공손찬', name_en: 'Gongsun Zan', name_cn: '公孫瓚', courtesy_kr: '백규', courtesy_cn: '伯珪', namu_title: '공손찬', faction: 'other', tier: 1, role: '백마장군, 유비 초기 후원' },
  { name_kr: '맹획', name_en: 'Meng Huo', name_cn: '孟獲', namu_title: '맹획', faction: 'other', tier: 1, role: '남만왕, 칠종칠금' },
  { name_kr: '장송', name_en: 'Zhang Song', name_cn: '張松', courtesy_kr: '영년', courtesy_cn: '永年', namu_title: '장송', faction: 'other', tier: 1, role: '유비 입촉 내응' },
  { name_kr: '화타', name_en: 'Hua Tuo', name_cn: '華佗', courtesy_kr: '원화', courtesy_cn: '元化', namu_title: '화타', faction: 'other', tier: 1, role: '신의(神醫)' },
  { name_kr: '여포의 딸', name_en: 'Lu Lingqi', name_cn: '呂玲綺', namu_title: '여포/가족', faction: 'other', tier: 1, role: '여포의 딸 (창작)' },
  { name_kr: '축융', name_en: 'Zhu Rong', name_cn: '祝融', namu_title: '축융부인', faction: 'other', tier: 1, role: '남만 여장수' },
  { name_kr: '안량', name_en: 'Yan Liang', name_cn: '顏良', namu_title: '안량', faction: 'other', tier: 1, role: '원소 맹장, 관우에게 참수' },
  { name_kr: '문추', name_en: 'Wen Chou', name_cn: '文醜', namu_title: '문추', faction: 'other', tier: 1, role: '원소 맹장' },
  { name_kr: '조홍', name_en: 'Cao Hong', name_cn: '曹洪', courtesy_kr: '자렴', courtesy_cn: '子廉', namu_title: '조홍', faction: 'wei', tier: 1, role: '조조 혈족 장수' },
];

export const ALL_CHARACTERS = [...TIER_0, ...TIER_1];

/**
 * KR→EN, EN→KR, KR→CN 매핑 생성
 */
export function buildNameMap() {
  const kr2en = {}, en2kr = {}, kr2cn = {}, cn2kr = {};
  for (const c of ALL_CHARACTERS) {
    kr2en[c.name_kr] = c.name_en;
    en2kr[c.name_en] = c.name_kr;
    kr2cn[c.name_kr] = c.name_cn;
    cn2kr[c.name_cn] = c.name_kr;
  }
  return { kr2en, en2kr, kr2cn, cn2kr };
}
