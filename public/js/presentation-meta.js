export const COMMAND_SCENES = {
  government: {
    id: 'government',
    name: '시정',
    kicker: '내정·건설·교역',
    captionOwned: '도시 성장과 장기 보너스를 설계하는 장면입니다.',
    captionForeign: '적대 도시에서는 시정 장면을 사용할 수 없습니다.',
    placeholderTitle: '시정을 결정할 차례입니다.',
    placeholderCopy: '투자, 교역, 건설, 연구 가운데 하나를 고른 뒤 결정하면 이번 달의 흐름이 바로 달라집니다.',
  },
  military: {
    id: 'military',
    name: '군사',
    kicker: '출정·징병·수송',
    captionOwned: '전선, 징병, 병력, 지형, 보급선을 함께 보고 군령을 내립니다.',
    captionForeign: '적대 도시를 고르면 개전과 침공 가능성을 바로 검토할 수 있습니다.',
    placeholderTitle: '전선 판단이 필요합니다.',
    placeholderCopy: '출진, 징병, 병력 이동, 선전포고 중 하나를 고르면 예상 전황과 위험이 우측에 표시됩니다.',
  },
  diplomacy: {
    id: 'diplomacy',
    name: '외교',
    kicker: '강화·동맹·첩보',
    captionOwned: '인접 세력과의 관계를 조정하고, 첩보를 준비하는 장면입니다.',
    captionForeign: '선택한 적대 세력을 상대로 외교와 첩보를 동시에 검토할 수 있습니다.',
    placeholderTitle: '관계를 조정할 차례입니다.',
    placeholderCopy: '강화, 동맹, 위협, 첩보 중 하나를 고르면 성공률과 평판 변화가 정리됩니다.',
  },
  personnel: {
    id: 'personnel',
    name: '인사',
    kicker: '탐색·상벌·배치',
    captionOwned: '장수 이동, 등용, 포상, 태수와 책사 인사를 다루는 장면입니다.',
    captionForeign: '적대 도시에서는 인사 장면을 열 수 없습니다.',
    placeholderTitle: '인재를 어떻게 굴릴지 정해야 합니다.',
    placeholderCopy: '탐색, 포상, 이동, 태수·책사 임명 중 하나를 고르면 담당 장수와 기대 효과가 정리됩니다.',
  },
};

export const FACTION_SEALS = {
  wei: '위',
  shu: '촉',
  wu: '오',
  liu_zhang: '익',
  zhang_lu: '한',
  neutral: '중',
};

export function getFactionSealLabel(factionId) {
  return FACTION_SEALS[factionId] || FACTION_SEALS.neutral;
}
