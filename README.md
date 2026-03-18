# wdttgukji

**세계관 데이터를 입력하면 코에이급 역사 전략 게임을 생성하는 에이전틱 파이프라인.**

첫 번째 적용: 삼국지.

---

## 퀵스타트

### 필수 조건
- **Node.js 18+** (ESM 사용). 확인: `node -v`
- **Git**

### 설치 & 실행

```bash
# 1. 클론 (77MB raw 데이터 포함, 1~2분 걸릴 수 있음)
git clone https://github.com/PKCrox/wdttgukji.git
cd wdttgukji

# 2. 의존성 설치
npm install

# 3. 로컬 게임 서버 실행
npm run dev
# → http://localhost:3001 에서 게임 플레이
```

프로덕션 배포판: [wdttgukji.vercel.app](https://wdttgukji.vercel.app)

### 장군이 (기획 리드) 워크플로우

```bash
# djg 브랜치에서 작업
git checkout djg
git merge main              # main 최신 반영 (현재 11커밋 뒤처짐)

# 작업 후 커밋 & 푸시
git add -A
git commit -m "뭘 했는지 한줄"
git push origin djg

# GitHub에서 djg → main PR 생성
```

**주요 작업 파일**:
| 작업 | 경로 | 설명 |
|---|---|---|
| 게임 플레이 | `http://localhost:3001` | 로컬 서버 or Vercel |
| soul.md 검수 | `data/characters/*.soul.md` | 73명 캐릭터 성격/가치관 |
| soul-data 확인 | `data/processed/soul-data/*.txt` | 343명 14소스 퓨전 원본 |
| 밸런스 조정 | `scripts/balance/train.js` | 밸런스 상수 (~120개 파라미터) |
| 밸런스 목표 | `scripts/balance/program.md` | 에이전트 지시문 |
| 이벤트 | `data/events/all-events.json` | 337개 게임 이벤트 |
| 게임 엔진 | `engine/` | 코어 로직 (건드리기 전 상의) |

---

## 프로젝트 배경

코에이 테크모는 삼국지 시리즈를 1985년부터 40년간 개발해왔다. 14편의 넘버링 타이틀과 수십 개의 파워업키트를 거치며 검증된 게임 메카닉(내정, 전투, 외교, 관계, 이벤트 시스템)은 역사 전략 게임의 사실상 표준이 되었다.

그러나 이 시리즈의 구조적 병목은 **콘텐츠 생산**이다. 삼국지8 리메이크 기준, 670명의 장수 능력치와 수백 개의 이벤트가 수작업으로 밸런싱되어 있다. 신작 하나에 수년, 수십억 원의 인력 비용이 든다. 그 결과 이벤트 분기의 깊이는 제한적이고, 대체역사 시나리오는 몇 개에 불과하며, 플레이어가 경험하는 서사의 다양성은 근본적으로 제약된다.

### 핵심 가설

LLM 기반 에이전틱 파이프라인으로 이 병목을 해소할 수 있다.

1. **캐릭터 모델링**: 역사 기록 + 기존 게임 데이터를 구조화하면, LLM이 각 장수의 성격·가치관·의사결정 패턴을 일관되게 시뮬레이션할 수 있다 (soul.md)
2. **이벤트 생성**: 기존 500개 이벤트를 시드로, 조건부 분기·대체역사·관계 기반 이벤트를 대량 생성하여 플레이마다 다른 서사를 만들 수 있다
3. **자동 테스트**: AI 플레이어 페르소나로 수천 회 자동 플레이하여 밸런스·재미·분기 다양성을 정량적으로 검증할 수 있다
4. **테마 독립**: 게임 메카닉을 세계관 데이터로부터 분리하면, 삼국지 이후 다른 역사·IP에도 동일 파이프라인을 적용할 수 있다

---

## 데이터 분석 기반 전략

### 현재 확보 데이터 (14개 소스, ~77MB raw + ~14MB processed)

| 카테고리 | 소스 | 규모 | 활용 |
|---|---|---|---|
| 나무위키 바이오 | `crawl-characters.js`, `crawl-tier2.js` | 187명 (20MB) | 한국어 캐릭터 전기 |
| 위키피디아 EN/ZH | `crawl-wiki-en.js`, `crawl-wiki-zh.js` | 각 73명 | 다국어 교차검증 |
| 정사 (나무위키) | `crawl-history.js` | 21 문서 (4.7MB) | 정사 기반 고증 |
| 정사 영역본 | `crawl-kongming-sgz.js` | 148명 (2.4MB) | 영문 정사 번역 |
| 연의 소설 (영문) | `crawl-kongming-novel.js` | 119/120 챕터 (1.4MB) | 영문 연의 전문 |
| 영문 백과사전 | `crawl-kongming-encyclopedia.js` | **1109명** (2.7MB) | 최대 인물 DB |
| Fandom 위키 | `crawl-fandom-rotk.js` | Koei 108 + 3K 26 (1.9MB) | 코에이 게임 데이터 |
| ROTK 능력치 | `crawl-zetawiki-stats.js` | 10:650 + 11:182 + 12:473 | 멀티버전 스탯 비교 |
| Gamecity RTK14 | `crawl-gamecity.js` | 1000명 명단 | 공식 장수 목록 |
| Koei 공식 바이오 | `crawl-koei-official.js` | 62명 (RTK14) | 공식 캐릭터 설명 |
| Reddit 커뮤니티 | `crawl-community.js` | 7 파일 (1.4MB) | 유저 센티먼트 |
| GitHub 데이터 | `crawl-github-rotk-data.js` | 20 파일 (6.3MB) | 구조화 게임 데이터 |
| 연의 120회 (한국어) | `crawl-novel.js` | 120회 전문 | 한국어 연의 |
| 세계관/전투 | `crawl-world.js`, `crawl-battles.js` | 종합 | 지리·전투 레퍼런스 |

### 크롤러 인벤토리 (20개)

| 스크립트 | 소스 | 설명 |
|---|---|---|
| `character-list.js` | — | **455명 마스터 DB** (T0-T3 전원) |
| `crawl-characters.js` | 나무위키 | Tier 0+1 바이오 |
| `crawl-tier2.js` | 나무위키 | Tier 2 바이오 (ROTK11 기반) |
| `crawl-history.js` | 나무위키 | 정사 문서 21페이지 |
| `crawl-novel.js` | 나무위키 | 연의 120회 (한국어) |
| `crawl-battles.js` | 나무위키 | 전투 데이터 |
| `crawl-world.js` | 나무위키 | 세계관 데이터 |
| `crawl-community.js` | Reddit + 나무위키 | 커뮤니티 감정 |
| `crawl-wiki-en.js` | Wikipedia EN | 영문 바이오 |
| `crawl-wiki-zh.js` | Wikipedia ZH | 중문 바이오 |
| `crawl-kongming-novel.js` | kongming.net | 연의 119챕터 (영문) |
| `crawl-kongming-encyclopedia.js` | kongming.net | **백과사전 1109명** |
| `crawl-kongming-sgz.js` | kongming.net | 정사 영역 148명 |
| `crawl-fandom-rotk.js` | Fandom | Koei + 3K 위키 |
| `crawl-zetawiki-stats.js` | zetawiki | ROTK 10/11/12 능력치 |
| `crawl-gamecity.js` | gamecity.ne.jp | RTK14 1000명 명단 |
| `crawl-koei-official.js` | koeitecmo | RTK14 공식 바이오 |
| `crawl-github-rotk-data.js` | GitHub | ROTK-XI-Tools, LTKDEX 등 |

모든 크롤러: `--resume` 재개, `--delay N` 요청간격(ms), 에러 시 graceful fallback.

### 프로토타입 검증 결과

**soul.md v2** — 73명 Claude Opus 생성 완료 (`data/characters/`), 343명 soul-data 추출 완료 (`data/processed/soul-data/`)

| 항목 | v1 (GPT-4o-mini) | v2 (Claude Opus) |
|---|---|---|
| 모델 | GPT-4o-mini | Claude Opus |
| 입력 소스 | 나무위키 1개 + 스탯 | **14소스 퓨전**: 3개국어 바이오 + 실제 대사 + 관계 + 멀티버전 스탯 + 정사 영역 + 백과사전 + 커뮤니티 |
| 명언/어록 | LLM 날조 | 연의 원문 실제 대사 (chapter + 중국어 원문 포함) |
| 관계 테이블 | 근거 없음 | 동시출현 횟수 + 에피소드 근거 |
| 연도 정확도 | 틀림 (장판교 208→217) | 스탯 생몰년 + 연표 교차검증 |
| 평균 길이 | ~2,000자 | ~7,800자 |
| 회차 인용 | 0개 | 평균 12.5개 |
| 캐릭터 수 | — | 73명 soul.md + **343명 soul-data** (12섹션) |

골드 스탠다드 3명(조조, 유비, 장비) 수작업 + Tier 0 17명 개별 에이전트 + Tier 1 53명 배치 에이전트.

**검증 인사이트**: soul.md의 가치관 우선순위와 행동 트리거가 캐릭터 차별화의 핵심 축으로 기능.
- 조조 AI: 관우 포로 → 등용 시도 3회 → 실패 시 석방 (존경+미련)
- 유비 AI: 관우 사망 → 이릉 원정 발동 (의리 > 전략적 합리성)

**이벤트 스키마 검증** — JSON Schema + 3개 레이어 예시 작성 완료 (`docs/schemas/`)

| 레이어 | 예시 | 검증 항목 |
|---|---|---|
| historical | 적벽대전 | 5개 트리거 조건, 2개 선택지, 연쇄 이벤트 연결 |
| relational | 도원결의 | 관계 조건, 의형제 관계 생성, 충성도 변화 |
| procedural | 가뭄 | 확률 트리거, 쿨다운, 도시 단위 효과 |

검증 결과: 스키마가 3개 레이어 모두를 표현 가능. 트리거 조건 13종 + 효과 15종으로 충분한 표현력 확보.

### 능력치 분포 분석 (멀티버전)

ROTK 10 (650명), ROTK 11 (182명), ROTK 12 (473명) 3개 버전의 능력치를 교차 비교.

```
ROTK 11 총합 기준 분포 (182명):
  S (400+):  19명 (10.4%)  — 조조(449), 주유(443), 사마의(437), 제갈량(417) 등
  A (350+):  58명 (31.9%)  — 하후돈, 장합, 노숙, 서서 등
  B (300+):  47명 (25.8%)  — 중급 장수
  C (250+):  37명 (20.3%)  — 하급 장수
  D (250-):  21명 (11.5%)  — 단역

ROTK 10: 650명 — 가장 넓은 인물 풀
ROTK 12: 473명 — 가장 최근 밸런스 조정
```

### 분석에서 도출한 전략적 결정

**1. 콘텐츠 생산 티어 시스템**

능력치 분포와 서사적 중요도를 교차 분석하여, 장수별 콘텐츠 생산 방식을 차등 적용한다.

| 티어 | 대상 | 수량 | soul.md 생산 방식 | 이벤트 밀도 |
|---|---|---|---|---|
| **Tier 0** | S급 + 연의 핵심 | 20명 | 수작업 작성 + 역사 고증 | 1인당 50~100개 |
| **Tier 1** | A급 + 연의 주요 | 53명 | AI 초안 (Claude Opus) → 수동 검수 | 1인당 20~50개 |
| **Tier 2** | B~C급 ROTK11 기반 | 42명 | AI 생성 → 자동 검증 | 1인당 5~20개 |
| **Tier 3** | ROTK 10/11/12 교차참조 | **340명** | 완전 AI 생성 (14소스 퓨전) | 1인당 1~5개 |
| **합계** | | **455명** | | |

근거:
- 조조(총449)와 유비(총399)의 50점 차이는 능력치 설계 철학을 반영한다. 조조는 올라운더, 유비는 매력(99) 편중 → soul.md에서 이 차이가 행동 패턴으로 드러나야 한다
- 연의 등장 빈도 TOP(관우, 손권, 장비, 조운)과 능력치 TOP은 일치하지 않는다 → **서사적 중요도**와 **능력치 강도**는 독립 축으로 관리해야 한다
- 위(23명) > 촉(18명) > 오(15명) 인재 불균형은 코에이가 의도한 것이다 → 밸런스를 인위적으로 맞추지 않고, 세력별 플레이 난이도 차이로 활용한다

**2. 이벤트 생성 전략**

기존 이벤트를 3개 레이어로 구분하고, 각각 다른 방식으로 확장한다.

| 레이어 | 예시 | 생성 방식 | 목표 수량 |
|---|---|---|---|
| **역사 이벤트** | 적벽대전, 관도대전, 삼고초려 | 수작업 (분기만 AI 확장) | ~200개 |
| **관계 이벤트** | 의형제 맺기, 배신, 혼인, 복수 | 규칙 기반 + AI 서사 | ~5,000개 |
| **절차적 이벤트** | 천재지변, 도적, 상인 조우, 발견 | 완전 AI 생성 | ~50,000개 |

핵심 원칙:
- 역사 이벤트는 정확도가 생명 → 연의/정사 크로스 검증 후 수작업
- 관계 이벤트는 soul.md의 성격 데이터가 트리거 조건을 결정 → 캐릭터 간 화학반응
- 절차적 이벤트는 양이 생명 → 매 플레이마다 다른 경험을 보장하는 풀

**3. 밸런스 자동 검증**

AI 테스트 에이전트가 다양한 페르소나로 반복 플레이하여 밸런스를 정량화한다.

| 메트릭 | 측정 방법 | 기준 |
|---|---|---|
| 세력별 통일 확률 | 1000회 시뮬레이션 | 위:촉:오 = 45:25:15 (나머지 15% 기타) |
| 평균 게임 길이 | 턴 수 | 200~400턴 (50~100년) |
| 이벤트 도달률 | 역사 이벤트 중 실제 발생 비율 | >60% |
| 분기 다양성 | 100회 플레이 시 고유 엔딩 수 | >20개 |

---

## 데이터 가공 파이프라인

77MB 원시 데이터(14소스, 20개 크롤러)를 게임 엔진이 소화할 수 있는 구조화된 데이터로 변환.

### 파이프라인 구조

```
Phase A — 규칙 기반 ($0, 병렬)
  P1(연의처리) ──→ P3(관계) ──→ P2(14소스 퓨전, 346 프로필)
  P4(전투시드) ─────────────────────────────────→ P8
  P5(지리) ──────────────────────────────────────→ (게임엔진)
  P6(정사처리) ────────────────────→ P2
  P7(커뮤니티) ────────────────────→ P2
  Px(이름교차참조) → build-name-xref.js → P2

Phase B — LLM 생성 (Claude Opus, $0 — 세션 내 서브에이전트)
  P2 ──→ P8(Soul-data 추출, 343명) ──→ Soul.md 생성
  P2 ──→ 이벤트 생성
```

### 산출물

| # | 파이프라인 | 스크립트 | 산출물 | 크기 |
|---|---|---|---|---|
| P1 | 연의 원문 처리 | `process-novel-chapters.js` | `novel-dialogues.json` + `novel-cooccurrence.json` + `novel-chapter-index.json` | 3.9MB |
| P2 | **14소스 캐릭터 퓨전** | `fuse-character-profiles.js` | `character-profiles/*.json` (**346개**) | ~12MB |
| P3 | 관계 그래프 | `extract-relationships.js` | `relationship-graph.json` | 287K |
| P4 | 이벤트 시드 | `extract-event-seeds.js` | `event-seeds.json` (337 seeds) | 414K |
| P5 | 지리/세력 | `structure-geography.js` | `geography.json` + `factions.json` | 28K |
| P6 | 정사 처리 | `process-history.js` | 정사 프로필 15명 | — |
| P7 | 커뮤니티 분석 | `process-community.js` | 감정 분석 96명 | — |
| P8 | **Soul-data 추출** | `extract-soul-data.js` | `soul-data/*.txt` (**343명**, 12섹션) | ~4MB |
| Px | 이름 교차참조 | `build-name-xref.js` | `name-xref.json` (440/455 매칭, 96.7%) | 200K |
| — | Soul.md v2 | 26× Claude Opus 서브에이전트 | `data/characters/*.soul.md` (73명) | 664K |
| — | 이벤트 생성 | 13× Claude Opus 서브에이전트 | `data/events/all-events.json` (337 이벤트) | 880K |
| — | 120회 요약 | 12× Claude Opus 서브에이전트 | `novel-chapter-summaries.json` (120회, 484 이벤트) | 287K |

### P7 Soul.md v2 — 품질 기준

soul.md는 AI 캐릭터 시뮬레이션의 핵심 자산. 저가 모델 사용 금지.

**v1→v2 핵심 차이**: v1은 GPT-4o-mini가 날조한 한국어 명언 사용. v2는 연의 원문(「」대사)에서 추출한 실제 중국어 대사 + 한국어 번역 + (XX회) 인용을 사용.

**생성 방식**:
- 골드 스탠다드 3명 (조조, 유비, 장비): 수작업 → few-shot 레퍼런스
- Tier 0 17명: 개별 서브에이전트 (1 에이전트 = 1 캐릭터, 최대 품질)
- Tier 1 53명: 배치 서브에이전트 (1 에이전트 = 6 캐릭터)

**입력 데이터**: `extract-soul-data.js`가 14소스 퓨전 프로필 JSON → ~10KB 컴팩트 텍스트(12섹션)로 압축 → 서브에이전트에 공급

**soul-data 12섹션**: 능력치, 연의 등장, 실제 대사(중국어), 관계(P3), 연표, 나무위키, EN Wikipedia, 정사삼국지, Kongming 백과사전, 정사 영역본(SGZ), 멀티버전 능력치(ROTK 10/11/12), 커뮤니티 평가

### P8 이벤트 생성 — 구조

337개 시드를 3개 티어로 분류하여 병렬 생성:

| 티어 | 소스 | 수량 | 에이전트 | 선택지 |
|---|---|---|---|---|
| A (전투+에피소드) | battles + episodes | 54 | 3개 | 2-3개/이벤트 |
| B (연표) | timeline-namu + timeline-yellow | 113 | 4개 | 의미있는 경우만 |
| C (연의 회차) | romance-chapters | 170 | 6개 | 의미있는 경우만 |

각 이벤트: `event-schema.json` 준수 (13종 트리거 조건, 15종 효과 타입), 한국어 서사 텍스트, 분위기 묘사, 전략적 선택지 + 게임 효과.

---

## 에이전트 아키텍처

```
┌─────────────────┐    ┌─────────────────┐
│   데이터수집팀    │───→│     기획팀       │
│                 │    │                 │
│ • 코에이 시리즈   │    │ • 역사 이벤트    │
│ • 연의/정사/대체사│    │ • 관계 이벤트    │
│ • 유저 센티먼트   │    │ • 절차적 이벤트  │
│ • 다국어 소스     │    │ • soul.md ×1000 │
└─────────────────┘    └────────┬────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    디자인팀      │───→│   게임개발팀     │←───│    테스트팀       │
│                 │    │                 │    │                 │
│ UI/UX 설계      │    │ 게임 엔진       │    │ AI 페르소나     │
│ 비주얼 에셋     │    │ Tauri + Canvas  │    │ 자동 플레이     │
│                 │    │                 │    │ 밸런스 리포트   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 에이전트별 명세

**데이터수집 에이전트**
```
도구: Playwright + Node.js fetch
파이프라인:
  1. 나무위키/위키백과/百度百科 — 인물 전기, 세력도, 지리
  2. 코에이 위키 (zetawiki, koei.fandom) — 능력치, 특기, 이벤트 조건
  3. Kongming's Archives — 연의 챕터별 등장, 관계도
  4. 유튜브 자막/댓글 — 플레이어 반응, 재미 포인트
  5. Reddit/디시/루리웹 — 커뮤니티 센티먼트, 밸런스 논쟁
  6. 중국/일본 커뮤니티 — 크로스컬처 관점
비용: $0 (오픈소스 크롤러)
```

**기획 에이전트**
```
도구: Claude Sonnet/Opus (soul.md 생성) + GPT-4o (품질 검수)
파이프라인:
  1. soul.md 생성 — 크롤링 데이터 → 구조화된 캐릭터 프로파일
     입력: 전기, 능력치, 관계, 연의 등장 이력
     출력: 성격/가치관/의사결정패턴/대화톤/행동근거
     비용: 1000명 × ~2000토큰 ≈ $10~30
     ⚠️ soul.md는 게임 AI 시뮬레이션의 핵심 자산. 저가 모델(GPT-4o-mini)로 만들면 안 됨
  2. 이벤트 대량 생성 — 시드 이벤트 + 세계관 컨텍스트 → 분기/파생
     비용: 50,000개 × ~1000토큰 ≈ $30
  3. 품질 검수 — 상위 10% 샘플링, GPT-4o로 일관성/재미/밸런스 체크
     비용: 5,000개 × ~2000토큰 ≈ $25
```

**테스트 에이전트**
```
도구: GPT-4o (페르소나 시뮬레이션) + 게임 엔진 API
파이프라인:
  1. 다중 페르소나 플레이 (공격적/방어적/외교적/롤플레이어)
  2. 매 선택지에서 의사결정 + 반응 로그
  3. 1000회 시뮬레이션 → 밸런스 메트릭 집계
  4. 이상 탐지 → 기획팀 피드백 루프
비용: 월 $10~30
```

---

## 주의 공간 이론 (Attention Space Theory)

장기 전략 게임(한 판에 수십 시간)의 핵심 설계 원리. 플레이어의 경험 공간은 세 겹의 벤다이어그램으로 구성된다:

```
┌─────────────────────────────────────────────┐
│              전체 (Total)                    │
│   ┌───────────────────────────────────┐     │
│   │         가능 (Possible)            │     │
│   │   ┌───────────────────────┐       │     │
│   │   │    신경 (Attention)    │       │     │
│   │   └───────────────────────┘       │     │
│   └───────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

- **신경 (Attention)** — 플레이어가 현재 관심을 기울이고 있는 공간. 보이는 정보, 추적하는 세력, 걱정하는 위협
- **가능 (Possible)** — 플레이어가 실제로 행동할 수 있는 공간. 공격 가능한 도시, 외교 가능한 세력, 투자 가능한 내정
- **전체 (Total)** — 게임 세계 전체. 아직 만나지 못한 장수, 먼 곳의 전쟁, 미발화 이벤트

### 단계별 밸런스 기준

| 단계 | 핵심 비율 | 설계 목표 |
|---|---|---|
| **초반** (1~50턴) | **신경 / 가능** | 신경 써야 할 것(위협, 기회)이 할 수 있는 것보다 살짝 많아야 한다. 긴장감. 가능이 전체에 먹히면(=아무것도 못 함) 무력감 → 이탈 |
| **중반** (50~200턴) | **가능 / 전체** | 신경과 가능이 거의 일치(=상황 파악 완료). 이제 가능이 전체 대비 얼마나 넓은지가 중요. 확장의 쾌감 vs 미지의 긴장 |
| **후반** (200턴~) | **전체의 이벤트 밀도** | 이미 이겼다고 느끼는 순간부터 시시해진다. 전체 공간 자체에 이벤트가 밀집해야 끝까지 긴장 유지 (반란, 배신, 천재지변, 연쇄 이벤트) |

### 설계 함의

1. **초반**: 시야를 좁히고(안개, 정보 제한), 즉각적 위협을 준다(조조 남하, 이민족 침공). 신경 > 가능이지만, 가능이 0이면 안 됨 — 항상 "이것만은 할 수 있다"를 보장
2. **중반**: 확장에 따라 가능 공간이 넓어지는 체감이 있어야 한다. 동시에 전체 공간의 존재감(먼 곳의 소문, 다른 세력의 대전쟁)으로 "아직 세계는 넓다"는 감각
3. **후반**: 승리가 확실해지는 시점에 이벤트 밀도를 폭증시킨다. 관우 사망 → 유비 이릉 원정, 사마의 쿠데타, 강유의 북벌 — 역사가 그랬듯 통일 직전이 가장 격렬해야 한다
4. **balance_score에 반영**: 초반 조기 멸망(가능=0)은 anomaly, 후반 교착(이벤트 밀도=0)은 stalemate로 이미 측정 중. 중반 확장 체감은 추후 메트릭 추가

이 이론은 이벤트 배치, AI 행동 패턴, 내정/전투 밸런스, 시나리오 설계 전반의 기초가 된다.

---

## 기술 스택

| 레이어 | 기술 | 근거 |
|---|---|---|
| 게임 엔진 | HTML Canvas + vanilla JS | 프로토타입 2D. 후순위로 WebGL/Three.js 확장 (전투씬 등) |
| 앱 래퍼 | Tauri (Rust) | 웹 기술 + 네이티브 패키징 (~10MB). Rust 백엔드로 성능 크리티컬 로직 처리 |
| AI 파이프라인 | LLM API (GPT-4o / Claude) | 이벤트 생성, 캐릭터 시뮬레이션, 테스트 페르소나 |
| 데이터 | JSON + SQLite | 정적 데이터(장수/이벤트)는 JSON, 게임 런타임 상태는 SQLite 로컬 |
| 배포 | 로컬 실행 (exe/app) | 호스팅 비용 $0. AI 호출만 인터넷 필요 |

---

## 코어 게임 메카닉

코에이 삼국지 시리즈에서 추출·추상화한, 테마 독립적 메카닉.

### 캐릭터
```yaml
Character:
  identity: { name, title, faction }
  stats: { military, intellect, leadership, politics, charisma }
  soul: "성격/기질/가치관 — AI 행동의 근거 (soul.md)"
  relationships: [{ target, type, intensity }]  # 의형제, 원수, 군신, 사제
  loyalty: number       # 세력 충성도
  ambition: number      # 독립/배신 확률
  narrative_weight: number  # 서사적 중요도 (등장 빈도 기반)
```

### 이벤트
```yaml
Event:
  id: string
  layer: "historical" | "relational" | "procedural"
  trigger: { conditions: [...] }
  narrative: string
  choices: [{ text, effects, next_event }]
  participants: [character_id]
  generation: "manual" | "ai_reviewed" | "ai_generated"
```

### 세력/영토
```yaml
Territory:
  cities: [{ name, population, economy, defense, governor }]
  army: { soldiers, morale, supply }
  diplomacy: [{ target_faction, relation, treaties }]
```

### 턴 구조
```
매 턴 (= 1개월):
  1. 이벤트 체크 — 트리거 조건 평가, 발화
  2. 내정 — 행동력 소비, 도시 관리
  3. 외교 — 동맹/계략/등용
  4. 전투 — 출진/방어/일기토
  5. AI 세력 행동 — 동일 규칙 기반 자율 행동
  6. 결산 — 자원/인구/충성도/관계 갱신
```

---

## 하드코딩 vs AI 생성 경계

| 영역 | 하드코딩 | AI 생성 | 결정 근거 |
|---|---|---|---|
| 게임 규칙 (턴/전투/자원 공식) | ✅ | | 결정론적 규칙은 예측 가능해야 함 |
| Tier 0 장수 (~20명) 능력치+soul.md | ✅ | | 핵심 캐릭터는 고증 기반 수작업 |
| Tier 1 장수 (~60명) soul.md | | ✅ + 수동검수 | AI 초안의 품질이 충분히 높음 |
| Tier 2~3 장수 (~900명) | | ✅ | 비용 대비 효과 |
| 역사 이벤트 (~200개) | ✅ | 분기만 AI | 역사 정확도 보장 |
| 관계/절차적 이벤트 (~55,000개) | | ✅ | 대량 생산이 핵심 가치 |
| NPC 대사/반응 | | ✅ | soul.md 기반 실시간 생성 |
| 맵/지형 | ✅ | | 지리는 고정 자산 |
| 밸런스 파라미터 | | ✅ (테스트 루프) | 수천 회 시뮬레이션 기반 자동 조정 |

> 최종 경계선은 기획 리드(장군이)가 확정한다.

---

## 비용 구조

### 1회성 비용 (콘텐츠 생성)

| 항목 | 산출 근거 | 비용 |
|---|---|---|
| soul.md 생성 (1000명) | Claude Sonnet/Opus, ~2000토큰/명 | ~$10~30 |
| 이벤트 생성 (50,000개) | GPT-4o-mini, ~1000토큰/건 | ~$30 |
| 품질 검수 (5,000개 샘플) | GPT-4o, ~2000토큰/건 | ~$25 |
| **소계** | | **~$56** |

### 월간 운영비

| 항목 | 산출 근거 | 비용 |
|---|---|---|
| AI 테스트 플레이 | GPT-4o, ~100회 시뮬/월 | ~$20 |
| 인프라 | 로컬 실행 (Tauri exe) | $0 |
| **소계** | | **~$20/월** |

> 초기 콘텐츠 생성 **~$56 1회**. 이후 월간 **~$20** (테스트 비용만).
> 게임은 로컬 실행 → 서버 호스팅 비용 없음. 유저 배포 시에도 exe 다운로드.

---

## 로드맵

### 현재 상태

- 현재 플레이 가능한 대상은 **208 적벽대전** 단일 시나리오다.
- 웹 데모 **우당탕탕삼국지**는 내부 실험용 **수직 슬라이스(vertical slice)** 단계까지 진입했다.
- 이미 확보한 강점:
  - 전쟁 루프가 실제로 열리고 끝나는 수준까지 정비되었다.
  - 내정/연구/건설이 턴 결산과 UI에 연결되었다.
  - stage 기반 화면 구조와 authored map 기반 전환이 시작되었다.
  - 헤드리스 평가 경로(`prepare.js`)로 교착률/턴 길이/이벤트 도달률을 추적할 수 있다.
- 현재 병목:
  - 몰입감 있는 화면별 command scene 부재
  - UI grammar 일관성 부족
  - 10분 수동 플레이 기준 체감/권력감 부족
  - 위 과강세와 낮은 역전성

### Phase 0: 데이터 수집 + 스키마 검증 ✅
- [x] 장수 능력치 크롤링 (삼국지 10/11/12, 멀티버전 1305명)
- [x] 연의 등장 이력 크롤링 (68명, 챕터별)
- [x] 삼국지14 로스터 크롤링 (1000명 명단, 세력별, 성격 유형)
- [x] 연의 120회 전체 이벤트 크롤링 (한국어 + 영문 119/120 챕터)
- [x] 역사 연표 크롤링 (나무위키 45개 + yellow.kr 73개)
- [x] 코에이 삼국지 8/11/14 게임 시스템 문서화
- [x] 삼국지11 특기 99개 크롤링
- [x] soul.md 프로토타입 2명 작성 (조조, 유비) — 검증 완료
- [x] 이벤트 스키마 정의 + 3레이어 예시 검증 (historical/relational/procedural)
- [x] 3개국어 위키 크롤링 (나무위키 + EN Wikipedia + ZH Wikipedia)
- [x] 연의 원문 120회 크롤링 (위키소스, 중국어 전문)
- [x] Kongming 영문 백과사전 1109명 크롤링
- [x] Kongming 정사 영역본 148명 크롤링
- [x] Fandom 위키 크롤링 (Koei 108 + 3K 26)
- [x] Koei 공식 RTK14 바이오 62명 크롤링
- [x] Gamecity RTK14 1000명 명단 크롤링
- [x] GitHub 구조화 데이터 수집 (3 repos, 20 files, 6.3MB)
- [x] Reddit 커뮤니티 센티먼트 수집

### Phase 0.5: 데이터 가공 파이프라인 ✅
- [x] P1: 연의 원문 처리 — 대사 추출 + 화자 귀속 + 동시출현 매트릭스
- [x] P2: **14소스 캐릭터 퓨전** — **346개 프로필** (14개 소스 융합 + 10-전략 이름 교차참조)
- [x] P3: 관계 그래프 — 타입/강도/근거 기반 관계 엣지
- [x] P4: 이벤트 시드 — 337개 시드 (전투28 + 에피소드26 + 연표113 + 연의170)
- [x] P5: 지리/세력 구조화 — 18개 도시 + 24개 연결 + 11개 세력
- [x] P6: 120회 요약 — 회차별 한국어 요약 + 484 이벤트 + 566 캐릭터 액션
- [x] P7: Soul.md v2 — 73명 전원 Claude Opus 생성 (평균 7,800자, 12.5 회차인용)
- [x] P8: **Soul-data 추출** — **343명** (12섹션: 능력치, 연의, 대사, 관계, 연표, 나무위키, EN Wiki, 정사, 백과사전, 정사영역, 멀티버전, 커뮤니티)
- [x] P9: 이벤트 생성 — 337개 완전한 게임 이벤트 (97개 선택지 포함, event-schema 준수)
- [x] Px: 이름 교차참조 — 440/455 매칭 (96.7%, 10-전략 캐스케이딩)

> 상세: [데이터 가공 파이프라인](#데이터-가공-파이프라인) 섹션 참조

### Phase 1: 기획 스키마 확정 + 콘텐츠 시드 ✅
- [x] Tier 0 장수 20명 soul.md 완성 (v2, Claude Opus)
- [x] AI soul.md 생성 파이프라인 구축 (Tier 0: 개별 에이전트, Tier 1: 배치 에이전트)
- [x] AI 이벤트 생성 파이프라인 (337개 시드 → 337개 완성 이벤트)
- [ ] 하드코딩/AI 경계선 확정 (기획 리드 결정)

### Phase 2: 게임 코어 프로토타입 + 웹 세로 슬라이스 기반 ✅
- [x] 턴 엔진 (행동력 3/턴, 월 단위 자원 결산, 턴 로그)
- [x] 맵 렌더링 (Canvas 2D, 18도시 + 24연결, DPI 대응, 세력 색상, 이벤트 펄스)
- [x] 이벤트 트리거 엔진 (13종 조건 평가 + 16종 효과 적용, 337개 이벤트)
- [x] 4트랙 내정 시스템 (농업/상업/기술/치안, 도시별 보너스, 감쇠 수익, 반란)
- [x] 외교 시스템 (평판 기반, 강화/동맹/혼인/조공/위협, 휴전, AI 외교)
- [x] 강화 전투 시스템 (1-5라운드, 6진형+상성, 4계략, 일기토, 4지형)
- [x] 캐릭터 관리 (active/captive/wandering/dead, 탐색/등용/포로/배신/탈출)
- [x] 세력 AI (7단계 우선순위, soul.md 성향 테이블 기반)
- [x] Save/Load (localStorage JSON 직렬화, 역호환)
- [x] UI/HUD 프로토타입 + stage 기반 화면 재구성 착수
- [x] 208 적벽대전 시나리오 웹 플레이 가능
- [x] 헤드리스 밸런스 평가 경로 확보

### Phase 3: 208 수직 슬라이스 완성도 ← **현재 최우선**
- [ ] 화면별 authored scene 재설계
- [ ] 시정/군사/외교/인사 command scene 분리
- [ ] 도시 레일/연대기/턴 결산의 장면형 재구성
- [ ] 지도 심화: 경계/전선/도시 인장/지형 가독성
- [ ] 10분 플레이 체감 검증
- [ ] 수동 플레이 기준 UX polish
- [ ] 208 위/촉/오 체험 차별화

### Phase 4: 밸런스 오토리서치 운영화
- [x] Karpathy autoresearch 3-파일 구조 (`prepare.js` / `train.js` / `program.md`)
- [x] 밸런스 상수 레지스트리 (`train.js` — 7섹션 ~120개 파라미터)
- [x] balance_score 메트릭 (winKL + pacingDev + dramaPenalty + anomaly)
- [ ] 첫 autoresearch 루프 운영화 (에이전트가 train.js 수정 → prepare.js 평가 → keep/discard)
- [ ] `winDistribution` / `stalemateRate` / `avgTurns` / `avgEventReach` / `avgReversals` 기준 운영
- [ ] wei 과강세 완화
- [ ] 190/200/220 시나리오 확장 전 헤드리스 지표 안정화

### Phase 5: 에이전트 파이프라인 통합
- [ ] `ai/` 와 `AGENTS.md` 기준 역할 분리 운영화
- [ ] `world-data-researcher` / `koei-systems-designer` / `content-planner` / `engine-integrator` / `balance-researcher` / `qa-persona-simulator` 루프 정착
- [ ] 문서상 워크플로우를 실제 반복 운영 파이프라인으로 연결
- [ ] soul 소비 + 이벤트 생성 + QA persona + factory loop 운영화

### Phase 6: 테마 일반화 + 패키징
- [ ] 삼국지 종속 코드 분리 (엔진 vs 테마 데이터)
- [ ] 테마 교체 인터페이스 설계
- [ ] 두 번째 세계관 적용 테스트
- [ ] Tauri/배포 패키징 정리

### Next Up
1. command scene 재설계
2. 도시/연대기 UI 정리
3. authored map 2차 심화
4. 208 수동 플레이 QA
5. balance autoresearch 재가동

---

## 밸런스 오토리서치

[Andrej Karpathy의 autoresearch](https://github.com/karpathy/autoresearch) 패턴을 게임 밸런스 튜닝에 적용한다.

원본: AI 에이전트에게 LLM 학습 코드를 주고 밤새 자율 실험 → 코드 수정 → 5분 학습 → 메트릭 확인 → keep/discard → 반복. 630줄 스크립트로 ~12실험/시간, 하룻밤 ~100실험, 누적 개선이 스택되어 11% 효율 향상 달성.

### 카파시 원본 → 게임 밸런스 매핑

| autoresearch 원본 | wdttgukji 적용 | 역할 |
|---|---|---|
| `prepare.py` (고정 인프라) | `engine/` 전체 + `scripts/balance/prepare.js` | 게임 엔진, 헤드리스 시뮬, 평가 함수. **에이전트가 수정하지 않음** |
| `train.py` (에이전트가 수정) | `scripts/balance/train.js` | 밸런스 상수 + 시스템 공식. **에이전트가 자유롭게 수정** |
| `program.md` (인간의 지시) | `scripts/balance/program.md` | 밸런스 목표, 제약 조건, 금지 사항. **인간이 편집** |
| val_bpb (메트릭, lower=better) | balance_score (메트릭, lower=better) | 세력 승률 KL-divergence + 페이싱 이상치 |
| 5분 학습 → 평가 | N회 헤드리스 시뮬 → 평가 | 고정 시간 실험 단위 |
| git commit (개선 시) | git commit (개선 시) | 성공한 변경만 누적 |

### 3-파일 구조

**`prepare.js`** — 고정. 에이전트가 건드리지 않는다.
```
- 시나리오/이벤트 JSON 로드
- GameState 생성 → 턴 루프 → AI 전 세력 자동 플레이
- N회 시뮬레이션 실행 (Canvas/DOM 없음, 순수 상태 머신)
- 결과 집계: 세력별 승률, 평균 턴, 역전 횟수, 이벤트 도달률, 이상 게임 비율
- balance_score 산출 (단일 스칼라, lower=better)
```

**`train.js`** — 에이전트가 수정하는 유일한 파일. 모든 밸런스 상수와 공식이 여기 있다.
```
전투: baseCasualty, terrainMods, formationBonus, stratagemRates, duelThresholds
경제: investCost/gain, foodPerAgri, goldPerComm, popGrowth, rebellionThreshold
외교: peaceChance, allianceChance, repScale, truceDuration
AI:   attackProb, attackAdvantage, defendProb, investProb, recruitCost
캐릭: captureChance, defectionThreshold, loyaltyDecay
페이싱: maxEventsPerTurn, actionsPerTurn, moraleDecay
```

**`program.md`** — 인간이 쓰는 지시문. 에이전트가 이걸 읽고 train.js를 수정한다.
```markdown
# 밸런스 목표
- 세력 승률: 위 ~45%, 촉 ~25%, 오 ~15%, 기타 ~15%
- 게임 길이: 평균 200~300턴, 50턴 이내 종료 0%
- 역전: 게임당 2회 이상 (삼국지의 핵심 재미)
- 이벤트 도달: 역사 이벤트 60%+ 발화
- 이상 게임: 5% 미만 (조기 멸망, 무한 교착, 경제 폭주)

# 제약
- combat.baseCasualty는 0.15~0.50 범위
- AI가 플레이어를 4턴 이내에 공격하면 안 됨
- 한 번에 하나의 변수 또는 관련 변수 그룹만 수정
- 변경 이유를 커밋 메시지에 명시

# 현재 문제
- AI가 공격을 거의 안 함 (attackProb × risk가 너무 낮음)
- 위나라가 병력 우세임에도 남하하지 않음
- 게임이 400턴 교착으로 끝나는 비율이 높음
```

### 에이전트 루프

```
repeat:
  1. program.md 읽기 (밸런스 목표 + 현재 문제 파악)
  2. train.js 수정 (한 번에 하나의 변경)
  3. prepare.js 실행 → N회 시뮬레이션 → balance_score 산출
  4. if score improved:
       git commit "balance: {변경 내용} → score {before}→{after}"
       새 베이스라인으로 채택
     else:
       git checkout train.js  (되돌리기)
  5. 다음 실험으로
```

**처리량**: 1회 시뮬 ~50ms × 200회 = 10초/실험 → ~360실험/시간 → 하룻밤 ~3000실험.

### balance_score (단일 메트릭, lower=better)

카파시의 val_bpb와 동일한 역할. 에이전트가 이것만 보고 keep/discard를 결정한다.

```
balance_score = w₁·winKL + w₂·pacingDev + w₃·(1-dramaRate) + w₄·anomalyRate

  winKL       = KL-divergence(실제 승률 분포, 목표 분포)     — 0이면 완벽
  pacingDev   = |avgTurns - 250| / 250 + stdTurns / 250     — 0이면 완벽
  dramaRate   = (역전횟수 ≥ 2인 게임 비율)                    — 1이면 완벽
  anomalyRate = (조기멸망 + 교착) / N                         — 0이면 완벽

가중치: w₁=0.35, w₂=0.25, w₃=0.25, w₄=0.15
```

### 파일 구조

```
scripts/balance/
├── prepare.js         # 고정 인프라: 헤드리스 시뮬 + 평가 + score 산출
├── train.js           # 에이전트가 수정: 모든 밸런스 상수 + 공식
├── program.md         # 인간이 편집: 목표 + 제약 + 현재 문제
└── runs/              # 실험 로그 (자동 생성)
    └── {timestamp}.json
```

### 실행

```bash
# 현재 train.js로 밸런스 평가 (1회)
node scripts/balance/prepare.js

# 200회 시뮬레이션으로 score 산출
node scripts/balance/prepare.js --sims 200

# 에이전트 루프: Claude Code가 program.md 읽고 train.js 수정 → 반복
# (Claude Code 세션에서 program.md를 컨텍스트로 주고 실행)
```

### 왜 이 구조인가

카파시 autoresearch의 핵심 설계 원칙이 게임 밸런스에 그대로 적용된다:

1. **고정 실험 프로토콜** — prepare.js는 매번 동일한 조건으로 시뮬을 돌림 (과학 실험의 통제)
2. **단일 변수 테스트** — 에이전트가 한 번에 하나만 바꿈 (인과관계 추론 가능)
3. **객관적 측정 기준** — balance_score 단일 숫자 (주관적 판단 배제)
4. **keep/discard 이진 결정** — 개선되면 커밋, 아니면 되돌림 (누적 개선 보장)
5. **인간은 방향만** — program.md에 "뭘 원하는지"만 쓰고, "어떻게"는 에이전트가 탐색

---

## 팀

| 역할 | 담당 | 범위 |
|---|---|---|
| 기획 리드 | 장군이 | 게임 디자인, 콘텐츠 품질 기준, 하드코딩/AI 경계 결정 |
| 개발 리드 / AI 엔지니어 | pkc | 게임 엔진, 에이전트 파이프라인, 데이터 인프라 |
| 디자인 리드 / 프로듀서 | 홍대리 | UI/UX, 비주얼 에셋, 프로젝트 펀딩 |
| QA | AI 테스트 에이전트 + 수동 검증 | 밸런스, 버그, 서사 일관성 |

---

## 기여 가이드 (AI 코딩 워크플로우)

이 프로젝트는 전원 AI 도구(Claude Code, Cursor 등)를 사용한다. 아래는 충돌 없이 협업하기 위한 최소 규칙.

### 브랜치 전략

```
main              ← 안정 버전. 직접 커밋 금지. PR로만 머지.
  ├── feat/xxx    ← 기능 개발 (예: feat/event-engine, feat/soul-pipeline)
  ├── data/xxx    ← 데이터 작업 (예: data/tier0-souls, data/crawl-chinese)
  └── fix/xxx     ← 버그 수정
```

**규칙**:
- `main`에 직접 push하지 않는다. 항상 브랜치 → PR → 머지
- 브랜치 이름은 `{타입}/{설명}` 형식. 예: `feat/battle-system`, `data/guan-yu-soul`
- PR은 간단한 설명이면 충분. AI가 코드 리뷰 돌림

### 작업 흐름

```bash
# 1. 최신 main 받기
git pull origin main

# 2. 브랜치 만들기
git checkout -b feat/내작업이름

# 3. AI랑 작업하기 (Claude Code, Cursor 등)
#    파일 수정, 추가, 삭제...

# 4. 변경사항 확인
git status
git diff

# 5. 커밋
git add 파일이름           # 또는 git add -A (전체)
git commit -m "뭘 했는지 한줄 설명"

# 6. 푸시
git push -u origin feat/내작업이름

# 7. GitHub에서 PR 만들기 (또는 AI가 만들어줌)
#    main ← feat/내작업이름 으로 PR
```

### AI 도구 사용 시 주의

- **같은 파일을 동시에 수정하지 않기**: 작업 시작 전에 디스코드/카톡에서 "나 이 파일 작업한다" 공유
- **커밋 자주 하기**: AI가 대량 수정할 수 있으므로, 중간중간 커밋해서 되돌릴 수 있게
- **soul.md 수정 시**: `data/characters/` 아래 파일은 캐릭터 이름이 파일명. 한 PR에 한 캐릭터씩 권장
- **이벤트 수정 시**: `docs/schemas/event-schema.json`이 기준. 스키마 변경은 반드시 PR 리뷰

### 기획 리드 (장군이) 주요 작업 영역

| 작업 | 파일/위치 | 설명 |
|---|---|---|
| soul.md 검수 | `data/characters/*.soul.md` | AI가 생성한 초안의 성격/가치관/행동 패턴 검수 |
| 이벤트 기획 | `data/events/` | 역사 이벤트 분기 설계, AI 이벤트 품질 기준 |
| 밸런스 결정 | `docs/balance.md` (생성 예정) | 능력치 범위, 자원 공식, 전투 공식 |
| 하드코딩 경계 | README 내 테이블 | 어디까지 수작업, 어디부터 AI에 맡길지 |

---

## 디렉토리 구조

```
wdttgukji/
├── README.md
├── package.json
├── scripts/
│   ├── crawl/              # 20개 크롤러 (character-list.js = 455명 마스터 DB)
│   ├── process/            # 가공 파이프라인 (P1~P7 + build-name-xref.js)
│   ├── generate/           # LLM 생성 헬퍼 (extract-soul-data.js 등)
│   └── balance/            # 밸런스 오토리서치 (headless-sim, optimizer, configs/)
├── data/
│   ├── raw/                # 크롤링 원본 (gitignore, ~77MB, 14소스)
│   ├── characters/         # soul.md v2 (73명, 664K)
│   ├── events/             # 게임 이벤트 (all-events.json, 337개, 880K)
│   └── processed/          # 중간 산출물 (~14MB)
│       ├── character-profiles/  # 346개 통합 프로필 (14소스 퓨전)
│       ├── soul-data/           # 343개 soul-data (12섹션)
│       └── name-xref.json       # 이름 교차참조 (440/455 매칭)
├── docs/
│   ├── koei-analysis.md    # 코에이 게임 시스템 분석
│   └── schemas/            # 데이터 스키마 (event-schema.json 등)
├── engine/                 # 게임 코어 엔진 (balance-config.js = 중앙 파라미터 레지스트리)
├── ai/                     # AI 파이프라인 (생성/테스트)
├── themes/
│   └── three-kingdoms/     # 삼국지 테마 데이터
└── public/                 # 프론트엔드 (wdttgukji.vercel.app)
```
