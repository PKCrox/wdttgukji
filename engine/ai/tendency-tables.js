// Tendency Tables — soul.md에서 추출한 세력 리더 행동 성향

export const TENDENCY = {
  cao_cao: {
    name: '조조',
    attack: 1.5,      // 공격 성향 가중
    defend: 0.8,
    diplomacy: 1.0,
    economy: 1.2,
    recruit: 1.8,     // 인재 등용 적극적
    risk: 1.4,         // 리스크 감수형
    // soul.md: "리스크 감수형, 인재 갈망, 효율 추구"
    // 패배 후: 즉시 재건, 감정 표출 짧고 회복 빠름
    postDefeat: 'rebuild',
    personality: 'aggressive_pragmatist'
  },

  liu_bei: {
    name: '유비',
    attack: 0.8,
    defend: 1.3,       // 방어 성향 가중
    diplomacy: 1.6,    // 동맹 적극적
    economy: 1.0,
    recruit: 1.5,      // 삼고초려식 인재 구애
    risk: 0.6,         // 위험 회피, 생존 우선
    // soul.md: "위임형 리더, 감정 기반 결정 가능, 인내→폭발"
    postDefeat: 'flee_and_ally',
    personality: 'charismatic_survivor'
  },

  sun_quan: {
    name: '손권',
    attack: 0.7,       // 직접 공격 시 패배 확률 높음
    defend: 1.5,       // 수성 특화
    diplomacy: 1.3,    // 실리 외교
    economy: 1.2,
    recruit: 1.4,      // 인재 위임 달인
    risk: 0.8,
    // soul.md: "인재에게 위임하면 승리, 직접 나서면 패배"
    postDefeat: 'delegate_and_defend',
    personality: 'delegating_defender'
  },

  liu_zhang_char: {
    name: '유장',
    attack: 0.3,
    defend: 1.0,
    diplomacy: 0.8,
    economy: 1.2,
    recruit: 0.5,
    risk: 0.2,          // 극도로 소극적
    postDefeat: 'surrender',
    personality: 'passive_ruler'
  },

  zhang_lu_char: {
    name: '장로',
    attack: 0.4,
    defend: 1.2,
    diplomacy: 0.6,
    economy: 0.8,
    recruit: 0.4,
    risk: 0.3,
    postDefeat: 'surrender',
    personality: 'religious_leader'
  }
};

// 기본 성향 (등록 안 된 세력용)
export const DEFAULT_TENDENCY = {
  attack: 1.0,
  defend: 1.0,
  diplomacy: 1.0,
  economy: 1.0,
  recruit: 1.0,
  risk: 1.0,
  postDefeat: 'defend',
  personality: 'balanced'
};

export function getTendency(leaderId) {
  return TENDENCY[leaderId] || DEFAULT_TENDENCY;
}
