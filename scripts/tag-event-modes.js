/**
 * 정사 vs 연의 분기 모드 — 이벤트 태깅
 *
 * 규칙:
 * - hist_ 프리픽스 → mode: "history"
 * - novel_ 프리픽스 → mode: "romance"
 * - 겹치는 연도+주제 → 쌍으로 연결 (pair_id)
 * - 초자연적 요소(혼령, 기원, 도사) → romance_only: true
 * - both 모드에서는 전부 노출, history/romance에서는 필터
 */
import { readFileSync, writeFileSync } from 'fs';

const FILE = 'data/events/all-events.json';
const data = JSON.parse(readFileSync(FILE, 'utf8'));

// 초자연적/연의 전용 키워드
const ROMANCE_ONLY_KEYWORDS = [
  '혼령', '귀신', '도사', '좌자', '관로', '예언', '초자연', '칠성등',
  '동남풍 기원', '팔진도', '목우유마', '축융부인',
  '별 떨어짐', '수명 연장'
];

// 정사 전용 (연의에 없거나 다른 사건)
const HISTORY_ONLY_KEYWORDS = [
  '정사', '실제로는', '역사적으로'
];

// 이벤트 쌍 매칭 키워드 (같은 사건의 정사/연의 버전)
const PAIR_TOPICS = [
  { topic: '황건적', keywords: ['황건'] },
  { topic: '동탁_암살', keywords: ['동탁', '암살'] },
  { topic: '관도대전', keywords: ['관도', '원소'] },
  { topic: '적벽대전', keywords: ['적벽', '화공'] },
  { topic: '합비_전투', keywords: ['합비', '장료'] },
  { topic: '정군산', keywords: ['정군산', '하후연', '황충'] },
  { topic: '관우_사망', keywords: ['관우', '사망', '처형', '포로'] },
  { topic: '조조_사망', keywords: ['조조', '사망'] },
  { topic: '이릉대전', keywords: ['이릉', '화공', '육손'] },
  { topic: '제갈량_사망', keywords: ['오장원', '제갈량', '사망', '별세'] },
  { topic: '삼고초려', keywords: ['삼고초려', '제갈량 영입', '사마휘'] },
  { topic: '장판_전투', keywords: ['장판', '조운', '유선 구출'] },
  { topic: '유비_성도', keywords: ['성도', '유장', '함락', '항복'] },
  { topic: '한중왕', keywords: ['한중왕', '한중 탈환'] },
  { topic: '번성_전투', keywords: ['번성', '수공', '우금'] },
  { topic: '손권_건국', keywords: ['손권', '오나라 건국'] },
  { topic: '유비_사망', keywords: ['유비', '사망', '백제성'] },
  { topic: '형주_함락', keywords: ['백의도강', '형주 함락', '여몽'] },
  { topic: '마초_거병', keywords: ['마초', '동관', '복수'] },
  { topic: '방통_전사', keywords: ['방통', '전사', '낙봉파'] },
  { topic: '주유_사망', keywords: ['주유', '사망'] },
  { topic: '장비_살해', keywords: ['장비', '암살', '살해'] },
  { topic: '위나라_건국', keywords: ['조비', '위나라 건국'] },
  { topic: '촉한_건국', keywords: ['유비', '촉한 건국'] },
  { topic: '가정_전투', keywords: ['마속', '가정'] },
  { topic: '사마의_쿠데타', keywords: ['사마의', '쿠데타', '고평릉'] },
  { topic: '촉한_멸망', keywords: ['촉한 침공', '등애', '종회'] },
  { topic: '삼국_통일', keywords: ['오나라 정복', '삼국 통일'] },
];

let tagged = 0, paired = 0;

for (const ev of data.events) {
  // 1. 기본 모드 태깅
  if (ev.id.startsWith('hist_')) {
    ev.mode = 'history';
  } else if (ev.id.startsWith('novel_')) {
    ev.mode = 'romance';
  } else {
    ev.mode = 'both'; // procedural/relational 등
  }

  // 2. 초자연 이벤트 → romance_only
  const nameText = ev.name + (ev.narrative?.text || '');
  if (ROMANCE_ONLY_KEYWORDS.some(kw => nameText.includes(kw))) {
    ev.romance_only = true;
    ev.mode = 'romance';
  }

  // 3. 이벤트 쌍 매칭
  for (const pair of PAIR_TOPICS) {
    if (pair.keywords.some(kw => nameText.includes(kw))) {
      ev.pair_topic = pair.topic;
      break;
    }
  }

  tagged++;
}

// 쌍 연결 — 같은 topic을 가진 hist/novel 이벤트 연결
const byTopic = {};
for (const ev of data.events) {
  if (!ev.pair_topic) continue;
  byTopic[ev.pair_topic] = byTopic[ev.pair_topic] || [];
  byTopic[ev.pair_topic].push({ id: ev.id, mode: ev.mode });
}

for (const [topic, events] of Object.entries(byTopic)) {
  const hist = events.filter(e => e.mode === 'history');
  const novel = events.filter(e => e.mode === 'romance');
  if (hist.length > 0 && novel.length > 0) {
    // 상호 연결
    for (const h of hist) {
      const ev = data.events.find(e => e.id === h.id);
      ev.pair_ids = novel.map(n => n.id);
    }
    for (const n of novel) {
      const ev = data.events.find(e => e.id === n.id);
      ev.pair_ids = hist.map(h => h.id);
    }
    paired++;
  }
}

// 통계
const modeCount = { history: 0, romance: 0, both: 0 };
let romanceOnly = 0, withPairs = 0;
for (const ev of data.events) {
  modeCount[ev.mode]++;
  if (ev.romance_only) romanceOnly++;
  if (ev.pair_ids?.length) withPairs++;
}

console.log(`Tagged: ${tagged} events`);
console.log(`Modes: history=${modeCount.history}, romance=${modeCount.romance}, both=${modeCount.both}`);
console.log(`Romance-only (supernatural): ${romanceOnly}`);
console.log(`Paired topics: ${paired}, events with pairs: ${withPairs}`);

// 메타데이터 추가
data.modes = {
  available: ['history', 'romance', 'both'],
  default: 'both',
  description: {
    history: '정사 기반 — 초자연 요소 제거, 역사 기록 중심',
    romance: '연의 기반 — 소설적 드라마, 초자연 요소 포함',
    both: '혼합 — 모든 이벤트 활성화 (기본값)'
  }
};

writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log('Written to', FILE);
