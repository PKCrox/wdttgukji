// balance-config.js — 게임 밸런스 하이퍼파라미터 레지스트리
//
// 모든 밸런스 상수를 여기서 중앙 관리한다.
// headless-sim이 config JSON으로 오버라이드 가능.
// 개별 모듈은 getConfig('combat.baseCasualty') 등으로 참조.

const DEFAULT = {
  // ── 전투 ──
  combat: {
    baseCasualty: 0.30,           // 전투당 기본 피해율
    terrainRiver: 0.8,            // 도하 공격 페널티
    terrainMountain: 0.7,         // 산지 공격 페널티
    commandScale: 1 / 200,        // 통솔→공격력 스케일
    warScale: 1 / 300,            // 무력→공격력 스케일
    defenseScale: 1 / 200,        // 방어시설→방어력 스케일
    moraleSwing: 40,              // 전투 결과 사기 변동 계수
    duelVariance: 10,             // 일기토 랜덤 마진
    duelMoraleCap: 20,            // 일기토 사기 보너스 상한
    duelInjuryMargin: 30,         // 부상 판정 마진
    duelDeathMargin: 50,          // 사망 판정 마진
    duelDeathChance: 0.30,        // 마진 초과 시 사망 확률
  },

  // ── 강화 전투 ──
  enhancedCombat: {
    formationCharge: { attack: 1.3, defense: 0.7, morale: 5 },
    formationTurtle: { attack: 0.8, defense: 1.4, morale: 0 },
    formationSurround: { attack: 1.2, defense: 0.9, armyReq: 1.3 },
    formationAmbush: { attack: 1.1, defense: 0.8, morale: -10 },
    counterBonus: 1.15,           // 상성 카운터 보너스
    terrainFormationBonus: 1.20,  // 지형+진형 시너지
    roundIntensityBase: 0.15,     // 라운드 기본 강도
    roundIntensityGrowth: 0.05,   // 라운드당 강도 증가
    moraleRetreat: 10,            // 퇴각 판정 사기 임계치
    earlyWinMoraleGap: 40,       // 조기 승리 사기 차이
    earlyWinRatio: 0.6,          // 조기 승리 전력 비율
    stratagemFireBase: 0.35,     // 화공 기본 성공률
    stratagemAmbushBase: 0.40,   // 매복 기본 성공률
    stratagemRetreatBase: 0.30,  // 거짓후퇴 기본 성공률
    stratagemDemoralizeBase: 0.35, // 심리전 기본 성공률
    stratagemMinThreshold: 0.15, // 계략 시도 최소 확률
    stratagemClampMax: 0.80,     // 계략 성공 상한
  },

  // ── 경제 (4트랙 내정) ──
  economy: {
    investCost: 500,              // 내정 투자 1회 비용
    investBaseGain: 3,            // 기본 증가량
    investGovernorScale: 0.04,    // 태수 능력치 반영 계수
    foodPerAgri: 6,               // 농업 레벨당 식량 생산
    goldPerComm: 12,              // 상업 레벨당 금 생산
    foodPerSoldier: 0.05,         // 병사 1인당 식량 소비
    foodPerPop: 0.005,            // 인구 1인당 식량 소비
    popGrowthBase: 0.002,         // 기본 인구 증가율
    popGrowthOrderBonus: 0.003,   // 치안 100일 때 추가 증가율
    moraleDecay: 1,               // 사기 자연 감쇠
    rebellionThreshold: 25,       // 반란 위험 치안 임계치
    rebellionChanceBase: 0.15,    // 치안 0일 때 반란 확률
    starvationDesertionRate: 0.05, // 기근 시 탈영률
    starvationMoralePenalty: -10, // 기근 사기 페널티
    popScaleFactor: 50000,        // 인구 정규화 기준
    diminishingReturn90: 0.3,     // 트랙 90 이상 효율
    diminishingReturn70: 0.5,     // 트랙 70 이상 효율
    diminishingReturn40: 0.8,     // 트랙 40 이상 효율
  },

  // ── 외교 ──
  diplomacy: {
    peaceChance: 0.30,
    allianceChance: 0.25,
    marriageChance: 0.15,
    threatenChance: 0.20,
    repScale: 0.003,              // 평판→외교 확률 스케일
    warWearinessBonus: 0.02,      // 전쟁 턴당 강화 보너스
    commonEnemyBonus: 0.20,       // 공통 적국 동맹 보너스
    truceDuration: 6,
    marriageTruce: 18,
    repGainPeace: 5,
    repGainAlliance: 8,
    repGainMarriage: 10,
    repLossWar: -10,
    repLossTruceBreak: -25,
    repLossAllianceBreak: -30,
    chanceBounds: [0.05, 0.95],   // 외교 확률 상/하한
  },

  // ── AI 행동 ──
  ai: {
    attackProb: 0.30,             // 공격 시도 기본 확률
    attackAdvantage: 1.5,         // 공격에 필요한 병력 배수
    attackArmyMin: 5000,          // 공격 최소 병력
    attackArmySend: 0.6,          // 출진 시 파견 비율
    defendProb: 0.60,             // 위협 시 방어 확률
    investProb: 0.50,             // 내정 투자 확률
    recruitProb: 0.25,            // 인재 탐색 확률
    captiveHandleProb: 0.30,      // 포로 처리 확률
    recruitCostPerSoldier: 5,     // 병사 모집 단가
    recruitMax: 2000,             // 턴당 최대 모집
    reinforceThreshold: 8000,     // 원군 파견 최소 병력
    reinforceRate: 0.30,          // 원군 파견 비율
    earlyProtectionTurns: 4,      // 플레이어 초반 보호
    captiveReleaseTurns: 8,       // 포로 석방 턴
  },

  // ── 캐릭터 ──
  character: {
    searchChance: 0.30,           // 인재 탐색 기본 확률
    recruitChance: 0.40,          // 등용 기본 확률
    captureChance: 0.35,          // 패장 포획 확률
    escapeBase: 0.10,             // 포로 탈출 기본 확률
    escapePerTurn: 0.03,          // 감금 턴당 추가 탈출 확률
    escapeCap: 0.50,              // 탈출 확률 상한
    persuadeBase: 0.15,           // 포로 설득 기본 확률
    defectionThreshold: 30,       // 배신 충성 임계치
    defectionChance: 0.05,        // 배신 기본 확률
    loyaltyDecayBase: 1,          // 충성도 자연 감쇠
    loyaltyLeaderScale: 0.02,     // 군주 매력 충성 회복
    swornBrothersBonus: 2,        // 의형제 충성 보너스
  },

  // ── 게임 페이싱 ──
  pacing: {
    maxEventsPerTurn: 3,
    actionsPerTurn: 3,
    reputationBounds: [0, 200],
    captiveLoyaltyOnRecruit: 40,
    wandererLoyaltyOnRecruit: 50,
    defectorLoyalty: 55,
  },
};

// ── 런타임: config JSON으로 오버라이드 ──

let _config = structuredClone(DEFAULT);

export function loadConfig(overrides) {
  _config = structuredClone(DEFAULT);
  if (!overrides) return;
  for (const [section, params] of Object.entries(overrides)) {
    if (_config[section]) {
      Object.assign(_config[section], params);
    }
  }
}

export function getConfig(path) {
  const [section, key] = path.split('.');
  return _config[section]?.[key];
}

export function getSection(section) {
  return _config[section] || {};
}

export function getAllConfig() {
  return structuredClone(_config);
}

export { DEFAULT as BALANCE_DEFAULTS };
