# Balance Loop

밸런스 조정은 감이 아니라 반복 실험으로 진행한다.

## 기본 계약

- 고정 인프라: `scripts/balance/prepare.js`
- 수정 대상: `scripts/balance/train.js`
- 사람 지시: `scripts/balance/program.md`

## 실험 절차

1. `program.md`에서 목표와 현재 문제를 읽는다.
2. 가설 하나를 세운다.
3. `train.js`의 한 변수 또는 관련 변수 그룹만 수정한다.
4. `node scripts/balance/prepare.js --sims 200 --report`를 실행한다.
5. `balance_score`와 구성 요소를 비교한다.
6. 개선되면 채택하고 기록한다. 악화되면 폐기한다.

## 금지 사항

- 한 번에 여러 축을 동시에 바꾸는 것
- score 비교 없이 감으로 유지하는 것
- 인프라 버그가 아닌데 `prepare.js`를 손대는 것

## 권장 로그 형식

- 가설
- 변경 변수
- score 전/후
- 부작용
- 다음 실험
