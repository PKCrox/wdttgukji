# Pass Priority Rubric

패스 종료 후 다음 패스를 무엇으로 쓸지 감으로 정하지 않기 위한 점수표.

각 후보 병목에 대해 아래 항목을 0~3점으로 매긴다.

## 점수 항목

### 1. Player Harm

- 0: 거의 눈에 안 띔
- 1: 거슬리지만 진행 가능
- 2: 플레이 리듬을 끊음
- 3: 첫 10분 경험을 무너뜨림

### 2. Visibility

- 0: 깊은 후반에서만 드러남
- 1: 특정 조건에서만 드러남
- 2: 자주 보임
- 3: 첫 프레임 또는 핵심 루프에서 즉시 보임

### 3. Leverage

- 0: 고쳐도 영향 범위 작음
- 1: 장면 하나 개선
- 2: 여러 장면/흐름 개선
- 3: 한 번 고치면 다음 패스 둘 이상이 쉬워짐

### 4. Confidence

- 0: 방향 불명확, 실험 먼저 필요
- 1: 구현 가능하지만 리스크 큼
- 2: 비교적 명확
- 3: 해결 방향과 게이트가 명확

### 5. Gate Pressure

- 0: 게이트와 무관
- 1: 품질 체감만 나쁨
- 2: QA 리스크를 키움
- 3: 현재 게이트 실패 또는 실패 직전

## 계산

기본 점수:

`priority = Player Harm + Visibility + Leverage + Confidence + Gate Pressure`

메타 반복 런에서는 여기에 두 개를 더 더한다.

- `Axis Deficit Boost`
  - 현재 축의 실제 횟수가 프로필의 `targetAxisCounts`보다 낮으면 가산
- `Remaining Pass Pressure`
  - 남은 패스 수 안에 목표 축 빈도를 채우기 어려워질수록 추가 가산

여기서 `targetAxisCounts`는 고정 할당이 아니라 `soft budget`이다.
즉 각 패스를 획일적으로 미리 배정하는 것이 아니라, adaptive scoring이 특정 축을 과소배정하지 않도록 잡아주는 역할이다.

권장 해석:

- 12~15: 다음 패스 최우선
- 9~11: 강한 후보
- 6~8: 보조 후보
- 0~5: 지금은 미룸

## 후보 분류 축

후보는 아래 축 중 하나 이상으로 분류한다.

- `ux-first-frame`
- `scene-clarity`
- `map-art`
- `overlay-readability`
- `interaction`
- `system-feedback`
- `qa-debt`
- `architecture-debt`

## 패스 종료 시 기록 형식

```json
{
  "dominant_bottleneck": "map-art",
  "next_pass_candidates": [
    {
      "label": "city rail compression",
      "axis": "ux-first-frame",
      "score": 12
    },
    {
      "label": "bespoke city iconography",
      "axis": "map-art",
      "score": 11
    },
    {
      "label": "battle report dramatization",
      "axis": "system-feedback",
      "score": 8
    }
  ],
  "chosen_next_pass": "city rail compression",
  "why_not_others": [
    "bespoke city iconography is valuable but first-frame density is still the larger immediate harm",
    "battle report dramatization does not currently block first 10 minutes readability"
  ]
}
```

## 주의

- 점수만으로 자동 결정하지 않는다.
- 단, 점수가 낮은 후보를 선택했다면 반드시 이유를 trace에 남긴다.
- 메타 반복 런에서는 “한 번은 나왔는가”만으로 충분하지 않다.
- README의 제품 핵심 축은 `requiredAxes + targetAxisCounts` 둘 다 충족해야 안정적인 루프라고 본다.
