// train.js — 에이전트가 수정하는 유일한 파일
//
// Karpathy autoresearch 패턴에서 train.py에 해당.
// 모든 밸런스 상수가 여기 있다. 에이전트가 값을 바꾸고
// prepare.js를 돌려서 balance_score가 개선되면 커밋, 아니면 되돌린다.
//
// ⚠️ prepare.js, engine/ 코드는 건드리지 않는다.
// ⚠️ 한 번에 하나의 변수 또는 관련 변수 그룹만 수정한다.

export const BALANCE = {

  // ═══ 전투 ═══
  combat: {
    baseCasualty: 0.30,           // 전투당 기본 피해율 (0.15~0.50)
    terrainRiver: 0.8,            // 도하 공격 페널티 배수
    terrainMountain: 0.7,         // 산지 공격 페널티 배수
    commandScale: 1 / 200,        // 통솔 → 공격력 스케일
    warScale: 1 / 300,            // 무력 → 공격력 스케일
    defenseScale: 1 / 200,        // 방어시설 → 방어력 스케일
    moraleSwing: 40,              // 전투 결과 사기 변동 계수
    duelVariance: 10,             // 일기토 랜덤 마진
    duelMoraleCap: 20,            // 일기토 사기 보너스 상한
    duelInjuryMargin: 30,         // 부상 판정 마진
    duelDeathMargin: 50,          // 사망 판정 마진
    duelDeathChance: 0.30,        // 마진 초과 시 사망 확률
  },

  // ═══ 강화 전투 ═══
  enhancedCombat: {
    formationCharge:   { attack: 1.3, defense: 0.7, morale: 5 },
    formationTurtle:   { attack: 0.8, defense: 1.4, morale: 0 },
    formationSurround: { attack: 1.2, defense: 0.9, armyReq: 1.3 },
    formationAmbush:   { attack: 1.1, defense: 0.8, morale: -10 },
    counterBonus: 1.15,
    terrainFormationBonus: 1.20,
    roundIntensityBase: 0.15,
    roundIntensityGrowth: 0.05,
    moraleRetreat: 10,
    earlyWinMoraleGap: 40,
    earlyWinRatio: 0.6,
    stratagemFireBase: 0.35,
    stratagemAmbushBase: 0.40,
    stratagemRetreatBase: 0.30,
    stratagemDemoralizeBase: 0.35,
    stratagemMinThreshold: 0.15,
    stratagemClampMax: 0.80,
  },

  // ═══ 경제 (4트랙 내정) ═══
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
    starvationDesertionRate: 0.05,
    starvationMoralePenalty: -10,
    popScaleFactor: 50000,
    diminishingReturn90: 0.3,
    diminishingReturn70: 0.5,
    diminishingReturn40: 0.8,
  },

  // ═══ 외교 ═══
  diplomacy: {
    peaceChance: 0.30,
    allianceChance: 0.25,
    marriageChance: 0.15,
    threatenChance: 0.20,
    repScale: 0.003,
    warWearinessBonus: 0.02,
    commonEnemyBonus: 0.20,
    truceDuration: 6,
    marriageTruce: 18,
    repGainPeace: 5,
    repGainAlliance: 8,
    repGainMarriage: 10,
    repLossWar: -10,
    repLossTruceBreak: -25,
    repLossAllianceBreak: -30,
    chanceBounds: [0.05, 0.95],
  },

  // ═══ AI 행동 ═══
  ai: {
    attackProb: 0.30,             // 공격 시도 기본 확률
    attackAdvantage: 1.5,         // 공격에 필요한 병력 배수
    attackArmyMin: 5000,          // 공격 최소 병력
    attackArmySend: 0.6,          // 출진 시 파견 비율
    defendProb: 0.60,             // 위협 시 방어 확률
    investProb: 0.50,             // 내정 투자 확률
    recruitProb: 0.25,            // 인재 탐색 확률
    captiveHandleProb: 0.30,
    recruitCostPerSoldier: 5,
    recruitMax: 2000,
    reinforceThreshold: 8000,
    reinforceRate: 0.30,
    earlyProtectionTurns: 4,      // 플레이어 초반 보호 턴
    captiveReleaseTurns: 8,
  },

  // ═══ 캐릭터 ═══
  character: {
    searchChance: 0.30,
    recruitChance: 0.40,
    captureChance: 0.35,
    escapeBase: 0.10,
    escapePerTurn: 0.03,
    escapeCap: 0.50,
    persuadeBase: 0.15,
    defectionThreshold: 30,
    defectionChance: 0.05,
    loyaltyDecayBase: 1,
    loyaltyLeaderScale: 0.02,
    swornBrothersBonus: 2,
  },

  // ═══ 게임 페이싱 ═══
  pacing: {
    maxEventsPerTurn: 3,
    actionsPerTurn: 3,
    reputationBounds: [0, 200],
    captiveLoyaltyOnRecruit: 40,
    wandererLoyaltyOnRecruit: 50,
    defectorLoyalty: 55,
  },
};
