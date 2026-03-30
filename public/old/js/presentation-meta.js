import {
  GENERATED_COMMAND_SCENE_OVERRIDES,
  GENERATED_COMMAND_STATUS_META,
  GENERATED_FACTORY_STATUS_META,
  GENERATED_START_SCREEN_CONTENT,
  GENERATED_WAR_ROOM_META,
} from './generated/app-surface-meta.js';

const BASE_COMMAND_SCENES = {
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

function mergeSceneOverrides(baseScenes, overrides) {
  return Object.fromEntries(
    Object.entries(baseScenes).map(([sceneId, scene]) => ([
      sceneId,
      {
        ...scene,
        ...(overrides?.[sceneId] || {}),
      },
    ]))
  );
}

export const COMMAND_SCENES = mergeSceneOverrides(BASE_COMMAND_SCENES, GENERATED_COMMAND_SCENE_OVERRIDES);

export const FACTION_SEALS = {
  wei: '위',
  shu: '촉',
  wu: '오',
  liu_zhang: '익',
  zhang_lu: '한',
  neutral: '중',
};

export const FACTION_SURFACE_THEMES = {
  wei: {
    id: 'wei',
    accentRgb: '124, 163, 214',
    glowRgb: '183, 212, 244',
    deepRgb: '28, 43, 69',
    warRoomKicker: '위 대본영',
    cityOverviewKicker: '북부 전장선',
    cityLockedKicker: '조조 결단선',
    commandKicker: '북부 군정국',
    resolutionKicker: '북부 결산판',
    bridgeKicker: '위 전선 이행',
    openingHudKicker: '위 선봉 약속',
  },
  shu: {
    id: 'shu',
    accentRgb: '103, 161, 102',
    glowRgb: '171, 214, 156',
    deepRgb: '28, 52, 31',
    warRoomKicker: '촉한 야전막',
    cityOverviewKicker: '촉한 생존선',
    cityLockedKicker: '유비 결의선',
    commandKicker: '융중 군의',
    resolutionKicker: '촉한 결산판',
    bridgeKicker: '촉 전선 교차',
    openingHudKicker: '촉 생존 약속',
  },
  wu: {
    id: 'wu',
    accentRgb: '189, 110, 86',
    glowRgb: '232, 176, 136',
    deepRgb: '74, 33, 24',
    warRoomKicker: '강동 수군본영',
    cityOverviewKicker: '강동 결전선',
    cityLockedKicker: '손권 지휘선',
    commandKicker: '강동 군정청',
    resolutionKicker: '강동 결산판',
    bridgeKicker: '오 수전 이행',
    openingHudKicker: '오 결전 약속',
  },
  liu_zhang: {
    id: 'liu_zhang',
    accentRgb: '196, 160, 96',
    glowRgb: '236, 206, 142',
    deepRgb: '69, 48, 22',
    warRoomKicker: '익주 방비진',
    cityOverviewKicker: '익주 방어선',
    cityLockedKicker: '익주 방비선',
    commandKicker: '촉도 군정소',
    resolutionKicker: '익주 결산판',
    bridgeKicker: '익 방어 이행',
    openingHudKicker: '익 방어 약속',
  },
  zhang_lu: {
    id: 'zhang_lu',
    accentRgb: '144, 135, 183',
    glowRgb: '201, 192, 229',
    deepRgb: '44, 38, 68',
    warRoomKicker: '한중 도관진',
    cityOverviewKicker: '한중 생존선',
    cityLockedKicker: '한중 방비선',
    commandKicker: '오두미도 군정청',
    resolutionKicker: '한중 결산판',
    bridgeKicker: '한중 방비 이행',
    openingHudKicker: '한중 생존 약속',
  },
  neutral: {
    id: 'neutral',
    accentRgb: '214, 178, 115',
    glowRgb: '229, 187, 104',
    deepRgb: '61, 43, 28',
    warRoomKicker: '작전 브리프',
    cityOverviewKicker: '출정 장면',
    cityLockedKicker: '거점 잠금',
    commandKicker: '군의 본영',
    resolutionKicker: '월말 결산판',
    bridgeKicker: '전선 이행',
    openingHudKicker: '전장 약속',
  },
};

export const FACTION_DOCTRINES = {
  wei: {
    label: '남하 압박',
    battlefield: {
      title: '남하 압박선',
      objectiveLead: '병참과 병력 우위를 끊기지 않게 이어붙이는 전장입니다.',
      actionLead: '압박 폭이 가장 두꺼운 축부터 잠그십시오.',
      riskLead: '확장 속도가 보급보다 빨라지면 남하선이 역류합니다.',
      whyNowLead: '이번 달엔 넓게 퍼지기보다 한 축을 깊게 누르는 편이 위답습니다.',
    },
    bridge: {
      kicker: '남하 재정렬',
      titleSuffix: '남하 압박이 다시 움직입니다',
      bodyLead: '병참과 병력 우위를 같은 축으로 정렬해 첫 명령을 잠그십시오.',
    },
    resolution: {
      kicker: '월말 압박판',
      focusLabel: '남하 축',
      pressureLabel: '압박 폭',
      actionLabel: '주도권 조치',
      riskLead: '주도권은 넓게 흩어질수록 약해집니다.',
      actionLead: '다음 턴은 병참이 붙는 거점부터 열어 압박선을 잇는 편이 좋습니다.',
    },
    command: {
      government: {
        boardTitle: '병참 정무 보드',
        status: '원정 병참',
        subhead: '원정군이 굴러갈 금맥과 공사를 먼저 묶는 장면입니다.',
        summaryLead: '남하 속도를 버틸 세수와 공사를 먼저 정렬해야 합니다.',
        actionLead: '즉시 성과보다 원정 지속력을 잠그는 선택이 우선입니다.',
        digestLead: '후방 풍요보다 원정 유지력을 먼저 읽는 판입니다.',
        noteLead: '지금 시정은 성장보다 원정 유지 비용을 버티는 데 초점이 있습니다.',
      },
      military: {
        boardTitle: '남하 군령 보드',
        status: '압박 유지',
        subhead: '적 접경을 넓히기보다 주공 축을 고정하는 장면입니다.',
        summaryLead: '병력 우위를 한 축에 모아 조조식 압박을 유지해야 합니다.',
        actionLead: '들어갈 곳보다 끝까지 붙들 곳을 먼저 고르십시오.',
        digestLead: '전선 곳곳을 찌르기보다 한 번 고른 축을 눌러야 하는 판입니다.',
        noteLead: '이번 군령은 넓은 기동보다 주공 축의 지속 압박이 핵심입니다.',
      },
      diplomacy: {
        boardTitle: '강압 외교 보드',
        status: '위세 과시',
        subhead: '전쟁 준비를 뒷받침할 위세와 고립 압박을 계산하는 장면입니다.',
        summaryLead: '외교도 회유보다 격차를 보여 주는 압박 수단으로 읽어야 합니다.',
        actionLead: '약속보다 공포와 계산이 앞서는 선택이 위답습니다.',
        digestLead: '우호 확보보다 상대가 버티기 어렵다고 느끼게 만드는 판입니다.',
        noteLead: '지금 외교는 정면 동맹보다 상대 고립과 위세 과시에 가깝습니다.',
      },
      personnel: {
        boardTitle: '원정 인사 장부',
        status: '전선 배치',
        subhead: '장수층을 주공 축과 후방 축으로 갈라 쓰는 장면입니다.',
        summaryLead: '장수 배치는 원정 유지와 돌파 축을 나눠 보는 편이 좋습니다.',
        actionLead: '다재다능한 장수를 흩뿌리기보다 주공선에 꽂으십시오.',
        digestLead: '인사는 취향이 아니라 전선 기계 배치처럼 읽혀야 합니다.',
        noteLead: '이번 인사는 원정 속도를 유지할 핵심 장수층 재배치가 핵심입니다.',
      },
    },
  },
  shu: {
    label: '생존 연대',
    battlefield: {
      title: '촉한 생존선',
      objectiveLead: '살아남을 거점을 지키면서 우군과 연결선을 만드는 전장입니다.',
      actionLead: '무리한 개전보다 버틸 수 있는 거점부터 잠그십시오.',
      riskLead: '한 도시라도 고립되면 촉한의 숨통이 급격히 좁아집니다.',
      whyNowLead: '이번 달은 영토 확대보다 생존선과 협력선을 묶는 데 의미가 있습니다.',
    },
    bridge: {
      kicker: '생존선 재정렬',
      titleSuffix: '촉한의 숨통이 다시 갈립니다',
      bodyLead: '버틸 거점과 기대야 할 우군을 함께 정리한 뒤 첫 명령을 여십시오.',
    },
    resolution: {
      kicker: '월말 생존판',
      focusLabel: '생존 거점',
      pressureLabel: '방어 압박',
      actionLabel: '연대 조치',
      riskLead: '촉은 한 번 비는 전선이 곧 고립으로 이어집니다.',
      actionLead: '다음 턴은 방어선과 우군 연결이 동시에 서는 거점부터 열어야 합니다.',
    },
    command: {
      government: {
        boardTitle: '생존 시정 보드',
        status: '민심 보존',
        subhead: '버텨야 할 도시의 치안과 회복력을 먼저 세우는 장면입니다.',
        summaryLead: '촉의 시정은 성장보다 생존력과 민심 유지가 우선입니다.',
        actionLead: '도시가 오래 버티게 하는 선택부터 잠그십시오.',
        digestLead: '한 턴의 이득보다 몇 턴 버틸 수 있는 내구를 읽는 판입니다.',
        noteLead: '지금 시정은 수익 극대화보다 생존 여력과 민심 보전이 핵심입니다.',
      },
      military: {
        boardTitle: '협곡 군령 보드',
        status: '방어 교차',
        subhead: '돌파보다 방어선과 퇴로를 함께 보는 장면입니다.',
        summaryLead: '촉의 군령은 과감한 진출보다 버티는 선과 반격 타이밍을 맞추는 데 있습니다.',
        actionLead: '적을 쫓기보다 무너지지 않을 전선을 먼저 택하십시오.',
        digestLead: '한 번의 승부보다 다음 턴까지 이어질 방어 구조를 읽어야 합니다.',
        noteLead: '이번 군령은 공격 찬스보다 퇴로와 버팀목을 같이 세우는 데 초점이 있습니다.',
      },
      diplomacy: {
        boardTitle: '원군 외교 보드',
        status: '우군 연결',
        subhead: '혼자 버티지 않기 위해 관계선과 숨구멍을 확보하는 장면입니다.',
        summaryLead: '촉의 외교는 체면보다 연대선 확보와 고립 회피가 우선입니다.',
        actionLead: '당장의 승부보다 다음 달 도와줄 손을 남기는 선택이 좋습니다.',
        digestLead: '적을 겁주기보다 누가 끝까지 등을 대줄지를 읽는 판입니다.',
        noteLead: '지금 외교는 화려한 선언보다 생존 동맹과 긴 호흡의 신뢰 확보입니다.',
      },
      personnel: {
        boardTitle: '의형 인사 장부',
        status: '핵심 인재',
        subhead: '부족한 장수층을 핵심 거점에 집중시키는 장면입니다.',
        summaryLead: '촉의 인사는 충성 높은 핵심 장수를 버팀목 도시에 꽂는 방향이 좋습니다.',
        actionLead: '모든 도시에 평균 배치하지 말고 핵심축을 먼저 채우십시오.',
        digestLead: '인재층이 얇을수록 누굴 어디에 세울지의 밀도가 중요합니다.',
        noteLead: '이번 인사는 소수 정예 장수층을 생존선에 다시 묶는 작업입니다.',
      },
    },
  },
  wu: {
    label: '결전 준비',
    battlefield: {
      title: '강동 결전선',
      objectiveLead: '수전과 방어 준비를 끝낸 뒤 결전 타이밍을 보는 전장입니다.',
      actionLead: '지금은 승부보다 결전을 위한 위치와 보급을 먼저 잠그십시오.',
      riskLead: '준비가 덜 된 결전은 강동의 이점을 한 번에 날립니다.',
      whyNowLead: '이번 달은 개전 자체보다 결전 조건을 완성하는 데 의미가 있습니다.',
    },
    bridge: {
      kicker: '결전 재정렬',
      titleSuffix: '강동의 결전 준비가 다시 움직입니다',
      bodyLead: '수전 축과 방어선, 보급 여력을 함께 정렬한 뒤 명령을 잠그십시오.',
    },
    resolution: {
      kicker: '월말 결전판',
      focusLabel: '결전 축',
      pressureLabel: '준비 압박',
      actionLabel: '결전 조치',
      riskLead: '오는 타이밍보다 준비가 먼저 무너지면 주도권을 잃습니다.',
      actionLead: '다음 턴은 수전 조건과 병참이 동시에 서는 거점부터 열어야 합니다.',
    },
    command: {
      government: {
        boardTitle: '강동 운영 보드',
        status: '결전 재정',
        subhead: '결전을 지탱할 금과 후방 정비를 먼저 맞추는 장면입니다.',
        summaryLead: '오는 즉시 이득보다 결전 준비 비용을 감당하는 운영이 우선입니다.',
        actionLead: '당장 번다기보다 결전 시점까지 버틸 운영을 택하십시오.',
        digestLead: '후방 정비와 수전 준비가 한 세트로 돌아가는 판입니다.',
        noteLead: '지금 시정은 확장보다 결전을 치를 자원과 후방 안정 확보가 우선입니다.',
      },
      military: {
        boardTitle: '수전 군령 보드',
        status: '결전 대기',
        subhead: '개전보다 지형과 보급이 맞는 순간을 재는 장면입니다.',
        summaryLead: '오의 군령은 즉시 돌입보다 결전 지점과 타이밍을 맞추는 데 있습니다.',
        actionLead: '이길 수 있는 물길과 방어선을 먼저 고르십시오.',
        digestLead: '병력 수보다 결전 조건이 갖춰졌는지를 읽어야 하는 판입니다.',
        noteLead: '이번 군령은 무작정 돌진보다 수전 조건과 보급 각을 세우는 데 초점이 있습니다.',
      },
      diplomacy: {
        boardTitle: '강동 교섭 보드',
        status: '결전 환경',
        subhead: '결전 전에 적을 묶고 우군을 움직이게 하는 장면입니다.',
        summaryLead: '오의 외교는 결전 환경 조성, 적 분산, 우군 연동이 핵심입니다.',
        actionLead: '단독 승부보다 결전장 주변 판을 유리하게 만드는 선택이 좋습니다.',
        digestLead: '말 한마디도 전장을 유리한 결전장으로 바꾸는 준비로 읽어야 합니다.',
        noteLead: '지금 외교는 승부 선언보다 결전 주변 조건을 자기 쪽으로 기울이는 작업입니다.',
      },
      personnel: {
        boardTitle: '강동 인재 장부',
        status: '결전 배치',
        subhead: '수전과 후방 방비에 맞는 장수 조합을 짜는 장면입니다.',
        summaryLead: '오는 장수층을 결전 핵심과 후방 유지축으로 분리해 써야 합니다.',
        actionLead: '모든 재능을 한 도시에 몰기보다 결전 구조에 맞게 묶으십시오.',
        digestLead: '인사는 즉시 화력보다 결전 순간 누가 어디 서는지의 설계입니다.',
        noteLead: '이번 인사는 수전 핵심 장수와 후방 유지 인재를 분리 배치하는 데 의미가 있습니다.',
      },
    },
  },
  liu_zhang: {
    label: '익주 방비',
    battlefield: {
      title: '익주 방어선',
      objectiveLead: '깊숙한 내륙 거점을 잃지 않도록 방비를 축적하는 전장입니다.',
      actionLead: '빠른 돌파보다 성과 방비와 후방 안정부터 잠그십시오.',
      riskLead: '한 번 뚫린 내륙선은 회복이 느려집니다.',
      whyNowLead: '이번 달은 넓히는 것보다 익주 내부를 단단히 묶는 데 의미가 있습니다.',
    },
    bridge: {
      kicker: '익주 방비 재정렬',
      titleSuffix: '익주 방비선이 다시 움직입니다',
      bodyLead: '내륙 방어선과 공사 축을 한 번에 읽고 첫 명령을 열어야 합니다.',
    },
    resolution: {
      kicker: '월말 방비판',
      focusLabel: '방비 거점',
      pressureLabel: '방어 압력',
      actionLabel: '성채 조치',
      riskLead: '익주는 한 번 비는 성문이 곧 장기 손실로 이어집니다.',
      actionLead: '다음 턴은 공사와 방어가 같이 서는 거점부터 열어야 합니다.',
    },
    command: {
      government: {
        boardTitle: '익주 시정 보드',
        status: '내륙 정비',
        subhead: '내륙 도시를 오래 버티게 할 건설과 운영을 맞추는 장면입니다.',
        summaryLead: '익주의 시정은 성장보다 방비 누적과 내구 확보가 우선입니다.',
        actionLead: '눈에 띄는 확장보다 성과 창고를 다지는 선택이 맞습니다.',
        digestLead: '공사와 방비가 바로 생존력으로 이어지는 판입니다.',
        noteLead: '지금 시정은 수익보다 내륙 거점의 방비 누적이 핵심입니다.',
      },
      military: {
        boardTitle: '익주 수비 보드',
        status: '성문 유지',
        subhead: '출정보다 방어선과 주둔 병력을 다지는 장면입니다.',
        summaryLead: '익주의 군령은 공격 찬스보다 수비 균열을 막는 데 무게가 있습니다.',
        actionLead: '먼저 나가기보다 비는 성문을 막는 선택이 낫습니다.',
        digestLead: '어디를 칠지가 아니라 어디가 뚫리면 안 되는지를 읽는 판입니다.',
        noteLead: '이번 군령은 공세보다 요충지 성문과 병참 유지가 우선입니다.',
      },
      diplomacy: {
        boardTitle: '익주 완충 보드',
        status: '완충 유지',
        subhead: '전면전보다 시간을 벌 완충선을 만드는 장면입니다.',
        summaryLead: '익주의 외교는 강한 연합보다 시간을 버는 완충이 중요합니다.',
        actionLead: '상대를 꺾기보다 당장 우리를 건드리지 않게 만드는 선택이 좋습니다.',
        digestLead: '외교는 승리보다 침입 속도를 늦추는 완충 장치처럼 읽어야 합니다.',
        noteLead: '지금 외교는 판을 바꾸기보다 시간을 사는 완충선 확보입니다.',
      },
      personnel: {
        boardTitle: '익주 관료 장부',
        status: '내부 안배',
        subhead: '내륙 도시의 태수와 수비 장수를 재배치하는 장면입니다.',
        summaryLead: '익주의 인사는 공격 장수보다 안정적인 수비 인재 안배가 핵심입니다.',
        actionLead: '한 명의 스타보다 각 성문을 지킬 사람을 먼저 채우십시오.',
        digestLead: '사람 배치는 전선 화력보다 내륙 안정도를 좌우하는 판입니다.',
        noteLead: '이번 인사는 방어 도시마다 비지 않는 관료·수비 라인을 만드는 데 의미가 있습니다.',
      },
    },
  },
  zhang_lu: {
    label: '한중 보존',
    battlefield: {
      title: '한중 보존선',
      objectiveLead: '작은 세력이 버틸 숨구멍과 완충선을 남기는 전장입니다.',
      actionLead: '확장보다 보존과 우회로 확보를 먼저 잠그십시오.',
      riskLead: '한중은 한 번 틈이 벌어지면 되돌릴 카드가 적습니다.',
      whyNowLead: '이번 달은 싸움의 승패보다 생존 공간을 남기는 데 의미가 있습니다.',
    },
    bridge: {
      kicker: '한중 보존 재정렬',
      titleSuffix: '한중의 숨구멍이 다시 갈립니다',
      bodyLead: '좁은 병력과 식량을 어디에 보존할지 먼저 정리한 뒤 첫 명령을 잠그십시오.',
    },
    resolution: {
      kicker: '월말 보존판',
      focusLabel: '보존 거점',
      pressureLabel: '생존 압박',
      actionLabel: '보존 조치',
      riskLead: '한중은 선택지 하나를 잃는 순간 다음 달 숨통이 바로 좁아집니다.',
      actionLead: '다음 턴은 병력과 식량을 가장 안전하게 남길 거점부터 열어야 합니다.',
    },
    command: {
      government: {
        boardTitle: '한중 운영 보드',
        status: '식량 보존',
        subhead: '작은 자원으로 버틸 식량과 치안을 먼저 맞추는 장면입니다.',
        summaryLead: '한중의 시정은 성장보다 자원 보존과 누수 방지가 우선입니다.',
        actionLead: '큰 도박보다 안정적으로 남기는 선택이 낫습니다.',
        digestLead: '많이 버는 판이 아니라 덜 잃는 판으로 읽어야 합니다.',
        noteLead: '지금 시정은 과감한 투자보다 식량과 치안 보존이 핵심입니다.',
      },
      military: {
        boardTitle: '한중 방비 보드',
        status: '전력 보존',
        subhead: '교전보다 병력 손실을 줄이는 장면입니다.',
        summaryLead: '한중의 군령은 승부보다 병력 보존과 퇴로 확보가 핵심입니다.',
        actionLead: '이길 싸움이 아니라 살아남는 싸움을 먼저 고르십시오.',
        digestLead: '한 번의 손실이 너무 큰 만큼 보존 중심으로 읽어야 하는 판입니다.',
        noteLead: '이번 군령은 공격 찬스보다 전력 보존과 안전한 퇴로가 우선입니다.',
      },
      diplomacy: {
        boardTitle: '한중 교섭 보드',
        status: '숨구멍 확보',
        subhead: '강한 약속보다 시간을 벌 통로를 여는 장면입니다.',
        summaryLead: '한중의 외교는 승리 선언보다 숨통과 우회로를 남기는 데 가깝습니다.',
        actionLead: '가장 멀리 가는 거래보다 당장 숨쉬게 하는 선택이 좋습니다.',
        digestLead: '외교는 명분보다 생존 공간을 넓히는 기술로 읽어야 합니다.',
        noteLead: '지금 외교는 압도보다 한 턴 더 버틸 숨구멍을 만드는 데 의미가 있습니다.',
      },
      personnel: {
        boardTitle: '한중 인사 장부',
        status: '핵심 보존',
        subhead: '적은 인재를 잃지 않고 핵심 거점에 붙이는 장면입니다.',
        summaryLead: '한중의 인사는 인재 발굴보다 가진 핵심 인재 보존이 우선입니다.',
        actionLead: '빈칸을 채우기보다 잃으면 안 될 인재를 먼저 보호하십시오.',
        digestLead: '인사 한 번이 전력 보존과 바로 연결되는 판입니다.',
        noteLead: '이번 인사는 핵심 인재를 안전 거점에 다시 묶는 데 의미가 있습니다.',
      },
    },
  },
  neutral: {
    label: '전선 정렬',
    battlefield: {
      title: '전장 정렬선',
      objectiveLead: '전선을 먼저 읽고 가장 영향력이 큰 거점을 잠그는 전장입니다.',
      actionLead: '다음 명령을 바로 이어갈 거점부터 선택하십시오.',
      riskLead: '첫 판독이 늦어지면 다음 장면의 가치가 흐려집니다.',
      whyNowLead: '이번 달은 전장 전체를 훑기보다 가장 영향력 큰 거점을 먼저 고르는 편이 좋습니다.',
    },
    bridge: {
      kicker: '전장 재정렬',
      titleSuffix: '전선이 다시 움직입니다',
      bodyLead: '집중 거점과 첫 장면을 같은 축으로 정렬한 뒤 명령을 잠그십시오.',
    },
    resolution: {
      kicker: '월말 전황',
      focusLabel: '판독 포인트',
      pressureLabel: '전선 압박',
      actionLabel: '우선 조치',
      riskLead: '경고와 기회를 같은 화면에서 읽어야 다음 달이 선명해집니다.',
      actionLead: '다음 턴은 가장 큰 변화가 생긴 거점부터 다시 여는 편이 좋습니다.',
    },
    command: {
      government: {
        boardTitle: '시정 브리핑',
        status: '도시 운영',
        subhead: '도시 성장과 장기 보너스를 설계하는 장면입니다.',
        summaryLead: '성장축 하나를 확실히 밀어주는 편이 좋습니다.',
        actionLead: '이번 달에 무엇을 누적할지 먼저 잠그십시오.',
        digestLead: '어디서 이득을 보고 어디가 흔들리는지 먼저 읽어야 합니다.',
        noteLead: '시정은 다음 몇 턴의 질감을 바꾸는 장기 선택입니다.',
      },
      military: {
        boardTitle: '전황 보드',
        status: '전선 판단',
        subhead: '전선, 징병, 병력, 지형, 보급선을 함께 보는 장면입니다.',
        summaryLead: '즉시 눌러볼 수 있는 전선과 병참 루트를 같이 판단해야 합니다.',
        actionLead: '출정과 보강 중 무엇이 더 급한지 먼저 잠그십시오.',
        digestLead: '같은 전선 보드 안에서 출정과 병력 이동을 읽어야 합니다.',
        noteLead: '군령은 병력뿐 아니라 보급과 지형을 함께 보는 판단입니다.',
      },
      diplomacy: {
        boardTitle: '외교 브리핑',
        status: '관계 조정',
        subhead: '강화, 동맹, 위협, 첩보를 함께 보는 장면입니다.',
        summaryLead: '성공률과 후폭풍을 같은 장부에서 읽어야 합니다.',
        actionLead: '관계선 하나를 분명하게 움직이는 선택을 고르십시오.',
        digestLead: '외교는 다음 전선을 미리 여는 준비 명령이기도 합니다.',
        noteLead: '첩보와 교섭은 다음 턴 전개를 바꾸는 장기 축입니다.',
      },
      personnel: {
        boardTitle: '인재 장부',
        status: '인재 운영',
        subhead: '장수 이동, 등용, 포상, 태수와 책사 인사를 다루는 장면입니다.',
        summaryLead: '장수층을 어디에 꽂느냐가 다음 전장 감각을 바꿉니다.',
        actionLead: '탐색보다 재배치가 급한지 먼저 판단하십시오.',
        digestLead: '장수 수와 포로, 방랑 인재, 태수 상태를 먼저 보여줘야 합니다.',
        noteLead: '인사는 도시 역할을 분리하는 핵심 장면입니다.',
      },
    },
  },
};

export function getFactionSealLabel(factionId) {
  return FACTION_SEALS[factionId] || FACTION_SEALS.neutral;
}

export function getFactionSurfaceTheme(factionId) {
  return FACTION_SURFACE_THEMES[factionId] || FACTION_SURFACE_THEMES.neutral;
}

export function getFactionDoctrine(factionId) {
  return FACTION_DOCTRINES[factionId] || FACTION_DOCTRINES.neutral;
}

export function getGeneratedStartScreenContent() {
  return GENERATED_START_SCREEN_CONTENT;
}

export function getGeneratedFactoryStatusMeta() {
  return GENERATED_FACTORY_STATUS_META;
}

export function getGeneratedWarRoomMeta() {
  return GENERATED_WAR_ROOM_META;
}

export function getGeneratedCommandStatusMeta(sceneId) {
  return GENERATED_COMMAND_STATUS_META?.[sceneId] || null;
}
