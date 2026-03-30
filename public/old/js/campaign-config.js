export const SAVE_KEY = 'wdttgukji_save';
export const SAVE_META_KEY = 'wdttgukji_save_meta';

export const FACTION_META = {
  wei: {
    leader: '조조 (曹操)',
    diff: 'easy', diffLabel: '쉬움',
    desc: '천하의 절반을 이미 손에 넣은 난세의 간웅. 압도적 병력과 인재로 남하를 노린다.',
    intro: [
      '건안 13년. 천하의 절반이 이미 당신의 손 안에 있다.',
      '형주의 유종이 항복하며 수군까지 얻었다. 80만 대군을 이끌고 장강을 건너면 강동의 손권과 떠돌이 유비 따위는 단숨에 쓸어버릴 수 있다.',
      '그러나 전쟁은 언제나 변수가 있는 법. 남방의 풍토, 수전에 익숙지 않은 북방 병사들, 그리고 아직 항복하지 않은 자들의 절박함 -',
      '천하통일의 마지막 퍼즐을 맞춰라.',
    ],
  },
  shu: {
    leader: '유비 (劉備)',
    diff: 'hard', diffLabel: '어려움',
    desc: '형주에서 겨우 버티는 한실의 후예. 제갈량의 천하삼분지계가 유일한 희망.',
    intro: [
      '건안 13년. 당신에게 남은 것은 형주 한 귀퉁이와 4만의 병사, 그리고 사람들.',
      '조조의 80만 대군이 남하하고 있다. 혼자서는 버틸 수 없다. 제갈량이 말했다 - 강동의 손권과 손잡으면 살 길이 있다고.',
      '한실 부흥의 대의를 내걸었지만, 지금은 살아남는 것이 먼저다. 적벽에서 기적을 만들 수 있다면, 삼분천하의 한 축이 될 수 있다.',
      '바닥에서 시작하는 역전의 서사. 당신의 선택이 역사를 바꾼다.',
    ],
  },
  wu: {
    leader: '손권 (孫權)',
    diff: 'normal', diffLabel: '보통',
    desc: '강동의 젊은 군주. 아버지와 형이 남긴 기반 위에서 난세를 헤쳐나간다.',
    intro: [
      '건안 13년. 아버지 손견, 형 손책이 피로 일군 강동 땅이 위기에 처했다.',
      '조조가 80만을 이끌고 남하한다. 조정의 대신들은 항복을 외치고, 무장들은 결전을 부르짖는다. 결정은 당신의 몫이다.',
      '주유와 노숙이 있고, 장강의 천험이 있다. 유비와 손을 잡으면 승산이 생긴다 - 하지만 동맹은 영원하지 않다.',
      '지금은 함께 싸우되, 전쟁이 끝난 뒤의 판도까지 내다봐라.',
    ],
  },
  liu_zhang: {
    leader: '유장 (劉璋)',
    diff: 'hard', diffLabel: '어려움',
    desc: '익주의 안일한 군주. 비옥한 땅이 있지만 야심도, 인재도 부족하다.',
    intro: [
      '건안 13년. 익주와 성도는 천혜의 요새다. 촉도(蜀道)의 험준함이 외적을 막아주고, 비옥한 분지가 백성을 먹여살린다.',
      '그러나 편안함은 독이 되었다. 조조가 한중을 넘보고, 유비가 형주에서 서쪽을 바라본다. 장로가 북쪽에서 호시탐탐 노린다.',
      '아버지 유언이 남긴 땅을 지키는 것만으로도 벅차다. 인재는 떠나고, 신하들은 각자의 속셈이 있다.',
      '난세에서 안일함은 죽음이다. 살아남으려면 변해야 한다.',
    ],
  },
  zhang_lu: {
    leader: '장로 (張魯)',
    diff: 'vhard', diffLabel: '매우 어려움',
    desc: '한중의 오두미도 교주. 작은 땅, 적은 병력. 생존 자체가 도전.',
    intro: [
      '건안 13년. 한중 땅 하나, 병사 만 명. 이것이 당신의 전부다.',
      '북쪽의 조조는 관중을 평정한 뒤 언제든 남하할 수 있고, 남쪽의 유장과는 오랜 원한이 있다. 사방이 적이다.',
      '오두미도의 신도들이 당신을 따르지만, 전쟁은 신앙만으로 이길 수 없다.',
      '최소한의 자원으로 최대한의 외교를 펼쳐라. 한중의 지형을 이용하고, 강자들 사이에서 살아남는 길을 찾아라.',
    ],
  },
};

export const OPENING_OBJECTIVES = {
  wei: [
    '남하 전선을 정리하고 형주 병력을 한 축으로 몰아붙인다.',
    '초반 몇 턴은 연구나 병참보다 전선 집결과 압박이 우선이다.',
  ],
  shu: [
    '생존이 최우선이다. 외교와 내정으로 첫 파도를 버틴다.',
    '형주의 약한 도시를 보강하고 연구/건설 한 축을 빠르게 연다.',
  ],
  wu: [
    '강동 수비와 전선 정비가 먼저다. 무리한 선공보다 방어 준비를 우선한다.',
    '외교와 연구를 통해 반격 타이밍을 만든다.',
  ],
  liu_zhang: [
    '익주의 안전지대를 활용해 내정과 방어 시설을 정비한다.',
    '전선이 열리기 전에 병력과 치안을 같이 쌓는다.',
  ],
  zhang_lu: [
    '한중 관문 방어와 치안 유지가 핵심이다.',
    '병력 손실 없이 시간을 벌며 연구와 방비를 축적한다.',
  ],
};

export const FACTION_LEADERS = {
  wei: 'cao_cao',
  shu: 'liu_bei',
  wu: 'sun_quan',
  liu_zhang: 'liu_zhang_char',
  zhang_lu: 'zhang_lu_char',
};

export const FACTION_DIALOGUES = {
  wei: [
    { speaker: '순욱', text: '승상, 형주의 유종이 항복하며 수군까지 얻었습니다. 장강을 건너는 것은 시간 문제입니다.' },
    { speaker: '조조', text: '하하, 주유와 제갈량이 손을 잡는다 한들 80만 앞에서는 무력하지.' },
    { speaker: '가후', text: '승상, 한 가지 우려가 있습니다. 북방 병사들은 수전에 익숙하지 않고, 남방의 풍토병도...' },
    { speaker: '조조', text: '걱정 마라. 연환계로 배를 잇대면 육지나 다름없다. 병사들의 멀미도 해결될 것이야.' },
    { speaker: '순유', text: '손권에게 항복을 권하는 서신을 보내는 것도 일책입니다. 전의를 꺾으면 피를 흘리지 않아도 됩니다.' },
    { speaker: '조조', text: '좋다. 전쟁은 시작 전에 이기는 것이 상책. - 그러나 거부한다면, 남김없이 쓸어버릴 것이다.' },
  ],
  shu: [
    { speaker: '제갈량', text: '주공, 조조의 80만 대군이 남하합니다. 우리 힘만으로는 막을 수 없습니다.' },
    { speaker: '유비', text: '군사의 뜻은 알겠소. 하나 손권이 우리와 손잡을 이유가 있겠소?' },
    { speaker: '제갈량', text: '손권 역시 조조를 두려워합니다. 제가 강동으로 건너가 설득하겠습니다. 함께라면 승산이 있습니다.' },
    { speaker: '관우', text: '형님, 군사를 믿으십시오. 우리에게는 아직 대의가 있고, 따르는 백성이 있습니다.' },
    { speaker: '장비', text: '형님! 이 장익덕이 살아있는 한, 형님 뒤는 제가 지킵니다!' },
    { speaker: '유비', text: '...좋다. 군사, 강동으로 가시오. 한실 부흥의 마지막 불씨를 - 우리가 지켜야 하오.' },
  ],
  wu: [
    { speaker: '노숙', text: '주공, 유비 쪽에서 제갈량이라는 자가 사신으로 왔습니다. 연합을 제안하고 있습니다.' },
    { speaker: '손권', text: '조조가 80만을 이끌고 온다... 조정의 대신들은 뭐라 하던가?' },
    { speaker: '노숙', text: '장소, 진군 등은 항복을 주장합니다. 조조의 세가 너무 크다고...' },
    { speaker: '주유', text: '항복이라니! 손가 3대가 피로 일군 강동을 고스란히 바치자는 겁니까!' },
    { speaker: '손권', text: '...도독의 뜻은?' },
    { speaker: '주유', text: '제게 정예 5만을 주십시오. 장강의 바람과 불로 - 조조의 목을 가져오겠습니다.' },
  ],
  liu_zhang: [
    { speaker: '장송', text: '주공, 조조가 관중을 평정하고 한중을 넘봅니다. 우리도 대비가 필요합니다.' },
    { speaker: '유장', text: '촉도가 험하니 쉽게 들어오지는 못할 것이다...' },
    { speaker: '법정', text: '주공, 촉도만 믿어서는 안 됩니다. 병사를 훈련시키고 관문을 보강해야 합니다.' },
    { speaker: '장송', text: '(천하의 영웅들이 움직이는데, 이 분은 언제까지 성도에 앉아만 계시려나...)' },
    { speaker: '유장', text: '...아버지가 남기신 이 땅만은 지켜야지. 그래, 우선 관문부터 점검하자.' },
  ],
  zhang_lu: [
    { speaker: '양송', text: '교주, 남쪽 유장과의 갈등이 심해지고 있습니다. 유장이 장수를 파견했다는 소식도...' },
    { speaker: '장로', text: '도의 힘으로 백성을 다스리면 만사가 평안한 법이다.' },
    { speaker: '방덕', text: '교주, 도로 나라를 지킬 수는 없습니다. 조조가 관중을 평정하면 한중이 다음 목표입니다.' },
    { speaker: '장로', text: '......' },
    { speaker: '방덕', text: '한중의 지형은 천혜의 요새입니다. 양평관만 굳건히 지키면 10만 대군도 막아낼 수 있습니다.' },
    { speaker: '장로', text: '그래... 우선은 방어를 굳히자. 신도들의 힘을 모아, 한중만은 지켜내야 한다.' },
  ],
};

export const OPENING_ACT = {
  wei: {
    focusCityId: 'xiangyang',
    victoryCue: '밀어붙이는 군세를 유지하되, 병참이 흐트러지면 남하 리듬이 끊긴다.',
    turns: [
      {
        title: '남하 기세를 굳힌다',
        preferredScene: 'military',
        objective: '형주 거점을 묶어 장강 남안 압박을 시작한다.',
        action: '양양이나 강릉 같은 전선 거점에서 군사 장면을 먼저 열어라.',
        risk: '남하가 늦어지면 오와 촉이 숨을 돌린다.',
        victoryCue: '첫 턴엔 준비보다 압박이 기억에 남아야 한다.',
      },
      {
        title: '전선을 벌리고 흔든다',
        preferredScene: 'military',
        objective: '한 곳만 보지 말고 남하 전선 전체를 흔들어 상대 판단을 꼬이게 만든다.',
        action: '병력 이동이나 선전포고로 접경 도시를 적극적으로 흔들어라.',
        risk: '병력이 분산되면 남하 우위가 공중분해된다.',
        victoryCue: '두 번째 턴에는 위나라다운 속도감이 보여야 한다.',
      },
      {
        title: '초반 주도권을 봉인한다',
        preferredScene: 'military',
        objective: '적이 반격 준비를 갖추기 전에 다음 목표 도시를 정한다.',
        action: '가장 앞선 전선 도시를 다시 선택해 공격과 집결 중 하나를 확정하라.',
        risk: '결정이 늦으면 조기 우세가 평범한 숫자로 흩어진다.',
        victoryCue: '세 번째 턴에는 “위가 밀어붙인다”는 인상을 남겨야 한다.',
      },
    ],
  },
  shu: {
    focusCityId: 'jiangling',
    victoryCue: '버티는 선택 하나가 살아남는 서사의 출발점이 된다.',
    turns: [
      {
        title: '살아남을 발판을 만든다',
        preferredScene: 'government',
        objective: '조조의 첫 압박을 맞기 전에 형주 거점 하나를 안정시킨다.',
        action: '강릉에서 시정 장면을 열고 방비, 치안, 군량 중 하나를 먼저 정리하라.',
        risk: '욕심내어 선공하면 촉의 첫 10분은 바로 무너질 수 있다.',
        victoryCue: '첫 턴은 촉의 불리함과 생존 감각이 또렷해야 한다.',
      },
      {
        title: '버티는 선을 그린다',
        preferredScene: 'diplomacy',
        objective: '외교나 병참으로 다음 파도를 견딜 숨구멍을 만든다.',
        action: '방어선 도시를 다시 열고 징병, 보급, 외교 중 하나를 택하라.',
        risk: '전선을 놓치면 한 번의 압박으로 흐름이 끝난다.',
        victoryCue: '두 번째 턴에는 “간신히 버틴다”는 감각이 살아야 한다.',
      },
      {
        title: '반격의 명분을 남긴다',
        preferredScene: 'military',
        objective: '지금 당장 이기기보다, 다음 턴의 선택지가 늘어나는 결정을 남긴다.',
        action: '핵심 거점의 명령 장면에서 대안 카드까지 비교해 하나를 확정하라.',
        risk: '준비 없는 반격은 촉의 유일한 기회를 날린다.',
        victoryCue: '세 번째 턴에는 약자지만 살아있다는 인상이 필요하다.',
      },
    ],
  },
  wu: {
    focusCityId: 'chai_sang',
    victoryCue: '결전을 준비하는 긴장과 강동의 안정감이 같이 보여야 한다.',
    turns: [
      {
        title: '결전 준비를 시작한다',
        preferredScene: 'military',
        objective: '장강 방어선과 결전 거점을 먼저 확인한다.',
        action: '시상이나 장강 접경 도시에서 군사 장면을 열고 방어선부터 읽어라.',
        risk: '결전 전에 전열이 흐트러지면 오의 강점이 사라진다.',
        victoryCue: '첫 턴은 “곧 싸운다”는 예감이 강해야 한다.',
      },
      {
        title: '방어와 외교를 동시에 굴린다',
        preferredScene: 'diplomacy',
        objective: '전선 하나를 지키면서 손유 연합의 리듬을 살린다.',
        action: '외교 장면으로 관계를 보고, 다시 군사 장면으로 수비를 정하라.',
        risk: '항복론이 머뭇거리게 만들면 결전 타이밍을 놓친다.',
        victoryCue: '두 번째 턴에는 준비된 강동의 냉정함이 살아야 한다.',
      },
      {
        title: '반격의 방향을 잡는다',
        preferredScene: 'military',
        objective: '장강 수비가 굳었다면 다음엔 어디를 찌를지 결정한다.',
        action: '전선 도시를 다시 선택해 공격, 징병, 동맹 유지 중 하나를 확정하라.',
        risk: '방어만 반복하면 오의 주도권이 사라진다.',
        victoryCue: '세 번째 턴에는 수비 세력이 아니라 계산하는 강자로 보여야 한다.',
      },
    ],
  },
  liu_zhang: {
    focusCityId: 'chengdu',
    victoryCue: '안일함 대신 “요새를 정비하는 군주”의 감각이 보여야 한다.',
    turns: [
      {
        title: '익주의 문을 잠근다',
        preferredScene: 'government',
        objective: '성도와 관문 거점 중 하나를 확실히 정비한다.',
        action: '성도에서 시정 장면을 열어 건설이나 방비를 먼저 누적하라.',
        risk: '안주하면 준비가 아니라 지연으로 보인다.',
        victoryCue: '첫 턴은 익주의 안전지대를 어떻게 쓰는지가 핵심이다.',
      },
      {
        title: '관문선의 빈틈을 메운다',
        preferredScene: 'military',
        objective: '병력과 치안이 약한 거점을 찾아 빈틈을 줄인다.',
        action: '징병이나 병력 이동으로 방어선 형태를 먼저 만들어라.',
        risk: '전선이 열리고 나서 대응하면 이미 늦다.',
        victoryCue: '두 번째 턴에는 수비국가다운 질서가 느껴져야 한다.',
      },
      {
        title: '내정형 세력의 템포를 고정한다',
        preferredScene: 'personnel',
        objective: '장기 운영을 위한 한 축을 확정한다.',
        action: '건설, 정책, 태수 배치 중 하나를 장기 투자로 확정하라.',
        risk: '모든 걸 조금씩 하면 결국 아무것도 인상에 남지 않는다.',
        victoryCue: '세 번째 턴에는 요새국가의 운영 감각이 남아야 한다.',
      },
    ],
  },
  zhang_lu: {
    focusCityId: 'hanzhong',
    victoryCue: '작지만 쉽게 무너지지 않는 한중의 생존 감각이 보여야 한다.',
    turns: [
      {
        title: '한중을 버틸 형태로 만든다',
        preferredScene: 'government',
        objective: '병력 손실 없이 첫 방어 태세를 잡는다.',
        action: '한중에서 군사나 시정 장면을 열어 방비와 병참부터 확인하라.',
        risk: '첫 손실이 바로 멸망 공포로 이어질 수 있다.',
        victoryCue: '첫 턴은 약하지만 버틴다는 인상을 남겨야 한다.',
      },
      {
        title: '작은 세력의 숨구멍을 연다',
        preferredScene: 'diplomacy',
        objective: '외교나 보급으로 다음 턴 생존 확률을 높인다.',
        action: '외교 장면이나 군량 관련 카드를 먼저 검토하라.',
        risk: '정면승부 위주 선택은 한중의 장점을 버리는 일이다.',
        victoryCue: '두 번째 턴에는 생존 전략이 보이기 시작해야 한다.',
      },
      {
        title: '강자들 틈에서 버틴다',
        preferredScene: 'military',
        objective: '지금 이 턴의 승리보다 다음 압박을 막을 준비를 우선한다.',
        action: '추천 명령과 대안 명령을 비교해 가장 안전한 선택을 확정하라.',
        risk: '욕심이 생기는 순간 한중의 균형이 무너진다.',
        victoryCue: '세 번째 턴에는 “쉽게 먹히지 않는다”는 느낌이 중요하다.',
      },
    ],
  },
};

export function getNarrativeModeLabel(mode) {
  switch (mode) {
    case 'history':
      return '정사';
    case 'romance':
      return '연의';
    default:
      return '혼합';
  }
}

export function getOpeningAct(factionId) {
  return OPENING_ACT[factionId] || null;
}

export function getOpeningActBeat(factionId, turn = 1) {
  const act = getOpeningAct(factionId);
  if (!act) return null;
  const clampedTurn = Math.max(1, Math.min(3, turn));
  const beat = act.turns?.[clampedTurn - 1] || act.turns?.[0] || null;
  return beat ? { ...beat, focusCityId: act.focusCityId, overallVictoryCue: act.victoryCue } : null;
}

export function getFactionSnapshot(source, factionId) {
  if (!source?.factions?.[factionId]) return null;

  const faction = source.factions[factionId];
  const cities = Object.values(source.cities || {}).filter((city) => city.owner === factionId);
  const army = cities.reduce((sum, city) => sum + (city.army || 0), 0);
  const characters = Object.values(source.characters || {}).filter((char) => char.faction === factionId);

  return {
    faction,
    meta: FACTION_META[factionId],
    cities,
    army,
    characters,
    allies: (faction.allies || []).map((id) => source.factions[id]?.name).filter(Boolean),
    enemies: (faction.enemies || []).map((id) => source.factions[id]?.name).filter(Boolean),
  };
}

export function buildSaveMeta(state) {
  if (!state?.player?.factionId || !state?.factions?.[state.player.factionId]) return null;

  const factionId = state.player.factionId;
  const faction = state.factions[factionId];
  const meta = FACTION_META[factionId] || null;
  const cityCount = Object.values(state.cities || {}).filter((city) => city.owner === factionId).length;

  return {
    factionId,
    factionName: faction.name,
    leader: meta?.leader || faction.name,
    turn: state.turn,
    year: state.year,
    month: state.month,
    cityCount,
    narrativeMode: state.narrativeMode || 'both',
    savedAt: new Date().toISOString(),
  };
}
