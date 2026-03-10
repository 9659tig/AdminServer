# Phase 4 Implementation Report

기준 문서: `AI_AGENT_DIRECTION_AND_MODEL_REVIEW.md`

## 1. Phase 4 목표 재확인

문서상 Phase 4 목표는 다음과 같았다.

1. 기존 경로와 신규 경로를 비교하며 실제 품질 확인
2. `legacy vs agent dual-run API`
3. Gold Set 수집
4. Top-K 적중률, consistency, failure rate 측정
5. 운영자 `approve/edit/reject` 로그 적재

완료 기준은 아래 두 가지였다.

- 신규 경로가 기존 경로보다 비열등 이상인지 판단 가능한 상태여야 함
- 비용/지연 허용 범위를 측정할 수 있어야 함

이번 구현은 이 기준을 만족하기 위한 "평가 가능한 운영 뼈대"를 코드로 도입하는 데 집중했다.

## 2. 이번 Phase에서 실제로 구현한 것

### 2.1 평가 전용 도메인 계층 추가

추가 파일:

- `src/agent/evaluation/types.ts`
- `src/agent/evaluation/evaluationStore.ts`
- `src/agent/evaluation/goldSetStore.ts`
- `src/agent/evaluation/sourceScoreStore.ts`
- `src/agent/evaluation/taskArtifacts.ts`
- `src/agent/evaluation/metrics.ts`
- `src/agent/evaluation/dualRunService.ts`

구성:

- `EvaluationStore`
  - dual-run 결과 저장

- `GoldSetStore`
  - 운영자 승인/수정 결과, 또는 gold label이 있는 평가 결과를 예제로 축적

- `SourceScoreStore`
  - `vision/transcript/shopping/legacy` source별 score 누적

- `metrics.ts`
  - `taskSuccessRate`
  - `failureRate`
  - `top1MatchRate`
  - `top3MatchRate`
  - `evidenceCoverageScore`
  - `consistencyScore`
  - `confidenceCalibration`
  - `avgLatencyMs`
  - `avgConfidence`

### 2.2 Evidence / Evaluation / Gold Set API 추가

수정 파일:

- `src/agent/http/agentController.ts`
- `src/routers/agentRouter.ts`
- `src/validation/agentSchemas.ts`

추가 API:

- `GET /agent/tasks/:taskId/evidence`
- `POST /agent/evaluations/dual-run`
- `GET /agent/evaluations/:evaluationId`
- `GET /agent/evaluations/summary`
- `GET /agent/gold-set`

의미:

- 기존 task 결과에서 evidence를 따로 조회 가능
- agent 결과를 여러 번 실행해 dual-run 평가 가능
- 누적된 평가 메트릭과 gold-set 상태를 조회 가능

### 2.3 Review -> Learning Signal 연결

수정 파일:

- `src/agent/core/orchestrator.ts`

추가 동작:

- `reviewTask()` 후 task 결과에서 extraction/evidence를 추출
- `approve/edit`는 Gold Set 예제로 저장
- `approve/edit/reject`는 source score에 반영
- `getTaskEvidence()` 추가

즉, 운영자 액션이 단순 히스토리 저장으로 끝나지 않고 평가 데이터로 축적되기 시작했다.

## 3. 왜 이 방안을 택했는가

## 3.1 dual-run을 별도 평가 서비스로 분리한 이유

선택한 방안:

- `DualRunService`가 workflow를 N회 실행하고, 결과/지표를 평가 전용 store에 저장하도록 했다.

이유:

1. task 실행과 평가 실행은 목적이 다르다.
2. 운영 task는 비동기 업무 수행이 목적이고,
3. dual-run은 품질 측정과 비교가 목적이다.

적용하지 않은 대안:

- `POST /agent/tasks`에 `dualRun: true` 같은 플래그를 붙여 task/평가를 한 API에서 처리하는 방식

배제 이유:

- 실행과 평가의 책임이 섞인다.
- Phase 5 전환 시에도 dual-run은 실험 기능으로 남아야 하므로, 경계를 나누는 편이 맞다.

## 3.2 Gold Set을 외부 DB가 아니라 in-memory store로 시작한 이유

선택한 방안:

- `GoldSetStore`, `EvaluationStore`, `SourceScoreStore` 모두 메모리 기반으로 구현했다.

이유:

1. 지금 단계에서 검증할 핵심은 평가 모델과 데이터 흐름이다.
2. 저장소를 먼저 영속화하면 문제 원인이 평가 로직인지 인프라인지 분리하기 어려워진다.
3. Phase 1~3도 같은 원칙으로 진행했고, 아직 task store 자체도 영속화 전 단계다.

적용하지 않은 대안:

- DynamoDB 테이블을 즉시 추가하고 실제 평가 데이터를 모두 영속화하는 방식

배제 이유:

- 현재 단계에서는 과하다.
- Phase 4 목표는 "수집/평가 구조 정립"이지 "운영 DB 마이그레이션"이 아니다.

## 3.3 Gold Set 자동 수집을 review 후 hook으로 붙인 이유

선택한 방안:

- `reviewTask()` 직후 `approve/edit` 케이스를 Gold Set으로 저장했다.

이유:

1. 운영자 승인 결과가 가장 가치 있는 라벨 데이터다.
2. 수동으로 따로 모으게 하면 실제로는 누락된다.
3. `edit`는 "agent 후보 + 운영자 수정" 데이터이므로 특히 중요하다.

적용하지 않은 대안:

- 별도 Gold Set 등록 API만 제공하고 운영자가 직접 예제를 저장하는 방식

배제 이유:

- 운영자 행동에 추가 작업을 요구하면 축적률이 떨어진다.

## 3.4 Phase 4에서 `/agent/tasks/:taskId/evidence`를 같이 넣은 이유

선택한 방안:

- evidence 전용 조회 API를 추가했다.

이유:

1. Phase 4의 핵심은 "비교와 평가"다.
2. 비교하려면 최종 결과뿐 아니라 근거도 따로 볼 수 있어야 한다.
3. summary만으로는 운영자 검토가 불가능하다.

적용하지 않은 대안:

- `GET /agent/tasks/:taskId` 응답만 계속 확장하는 방식

배제 이유:

- task detail과 evidence 조회는 관심사가 다르다.
- evidence는 이후 UI에서 독립적으로 소비될 가능성이 높다.

## 4. 주요 개선점

## 4.1 비결정적 workflow를 정량적으로 볼 수 있게 됨

이전까지는 workflow가 "작동한다"만 확인할 수 있었다.  
이제는 같은 입력을 여러 번 돌려 아래를 볼 수 있다.

- Top-1 / Top-3 match
- consistency
- failure rate
- evidence coverage
- latency

개선 효과:

- agent 품질을 정성 평가가 아니라 정량 평가로 전환할 기반 확보

## 4.2 운영자 review가 학습 신호로 변환됨

이제 `approve/edit/reject`는 단순 audit log가 아니다.

- `approve/edit` -> Gold Set 예제
- `approve/edit/reject` -> source score 갱신

개선 효과:

- 사람이 개입한 결과가 바로 다음 평가/튜닝의 근거가 된다.

## 4.3 Legacy와 agent를 비교 가능한 구조가 생김

Phase 3에서는 `legacyCandidates`가 결과에 포함되기만 했다.  
이번에는 dual-run 평가를 통해 반복 실행, 정답 비교, aggregate summary까지 가능해졌다.

개선 효과:

- 단발 비교가 아니라 운영 기간 전체에 대한 비교가 가능

## 4.4 Evidence 조회가 분리됨

`GET /agent/tasks/:taskId/evidence`가 추가되면서 evidence 확인이 쉬워졌다.

개선 효과:

- UI나 운영 화면에서 근거만 따로 보여주기 쉬움
- 검토 속도 향상

## 5. 완료 기준 검토

## 5.1 기준 1: 신규 경로가 기존 대비 비열등 이상인지 판단 가능한 상태인가

판정: 충족

근거:

1. dual-run 실행 API가 생겼다.
2. legacy 후보와 agent 후보 비교가 가능하다.
3. `top1/top3/consistency/failure/evidenceCoverage`가 계산된다.
4. `goldLabel`이 있으면 calibration까지 계산된다.

즉, 아직 실제 100~200건 데이터는 없지만 "판단 가능한 구조"는 구현되었다.

## 5.2 기준 2: 비용/지연 허용 범위를 측정 가능한가

판정: 부분 충족

근거:

1. 각 run의 `latencyMs`를 저장한다.
2. summary에서 `avgLatencyMs` 조회 가능하다.

제한:

- 현재는 비용 자체를 직접 집계하지는 않는다.
- provider usage token/cost 수집은 아직 없다.

판단:

- Phase 4 요구 중 "지연 측정"은 충족
- "비용 측정"은 다음 단계에서 provider usage telemetry를 붙이는 것이 맞다

## 6. 테스트 및 검증 결과

실행한 명령:

```bash
npm run test:phase4
npm run test:phase0
npm run test:phase1
npm run test:phase2
npm run test:phase3
```

### 6.1 Phase 4 테스트 결과

결과: 통과

- `dual-run-service.test.js`
  - dual-run 결과 저장
  - metrics 계산
  - gold-set/source-score 적재 확인

- `orchestrator-learning.test.js`
  - `getTaskEvidence()`
  - review 후 gold-set/source-score 학습 신호 반영 확인

- `router-and-schema.test.js`
  - evidence/evaluation/gold-set route 계약 확인
  - dual-run schema 검증 확인

- `controller-evaluation.test.js`
  - controller 응답 contract 확인

총 5개 테스트 통과.

### 6.2 회귀 테스트 결과

결과: 통과

- Phase 0: 5개 테스트 통과
- Phase 1: 4개 테스트 통과
- Phase 2: 4개 테스트 통과
- Phase 3: 5개 테스트 통과

의미:

- Phase 4의 평가 계층 추가가 기존 task/provider/workflow 경로를 깨지 않았다.

## 7. 구현 중 발견한 문제와 보완 내용

## 7.1 기존 Phase 1 route 테스트가 Phase 4 route 증가로 깨진 문제

원인:

- 기존 테스트가 agent router 전체 route 목록을 exact match로 고정하고 있었다.

보완:

- Phase 1 테스트를 "필수 task route 존재 확인"으로 바꿨다.

이유:

- Phase가 진행되며 route가 늘어나는 것은 정상이다.
- 이전 단계 회귀 테스트는 "필수 contract 유지"를 확인해야지 "미래 확장 금지"를 강제하면 안 된다.

## 7.2 Gold Set에 reject 케이스를 그대로 넣으면 정답 데이터가 오염되는 문제

판단:

- reject는 "현재 후보가 틀렸다"는 신호이지, 정답 레이블을 주는 신호가 아니다.

보완:

- Gold Set은 `approve/edit`만 적재
- reject는 source score에만 반영

## 7.3 dual-run 결과의 Top-K/consistency를 어디서 계산할지에 대한 문제

선택:

- service 안에서 raw run 저장
- `metrics.ts`에서 계산 함수로 분리

이유:

- 지표 계산식을 교체/확장하기 쉬움
- service 책임을 과도하게 키우지 않음

## 8. 현재 한계

이번 Phase는 평가 인프라의 첫 버전이다. 아직 없는 것:

- 실제 영속 저장
- provider token/cost 집계
- 운영자 UI dual-run 화면
- Gold Set 샘플링/버킷 관리
- calibration curve 시각화
- online canary / shadow traffic

즉, 지금 상태는 "평가 가능 구조"이지 "완전한 운영 관제 시스템"은 아니다.

## 9. 다음 Phase로 넘길 수 있는 상태인가

판정: 가능

이유:

1. 비교 API가 생겼다.
2. 평가 지표가 계산된다.
3. review가 학습 데이터로 축적되기 시작했다.

따라서 다음 단계는 `Phase 5. 전환 및 고도화`로 넘어가,

- 카나리 전환
- few-shot feedback 활용
- verifier 고도화
- legacy 경로 축소

를 시작할 수 있다.
