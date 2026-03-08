# Phase 1 Implementation Report

기준 문서: `AI_AGENT_DIRECTION_AND_MODEL_REVIEW.md`

## 1. Phase 1 목표 재확인

문서상 Phase 1 목표는 다음 두 가지였다.

1. HTTP 요청과 agent 실행을 분리한다.
2. task 생성 이후 상태, 오류, 단계별 출력이 추적 가능해야 한다.

완료 기준도 명확했다.

- task 생성 후 비동기 실행 가능
- 단계별 상태/오류/출력 확인 가능

이번 구현은 이 두 기준을 정확히 충족시키는 데 맞췄다.  
반대로, 아직 Phase 2 이상 범위인 LLM provider 추상화, DynamoDB 영속 task store, evidence API, verifier 고도화는 의도적으로 넣지 않았다.

## 2. 이번 Phase에서 실제로 구현한 것

### 2.1 Agent 전용 코어 계층 추가

추가 경로:

- `src/agent/core/types.ts`
- `src/agent/core/taskStore.ts`
- `src/agent/core/stepStore.ts`
- `src/agent/core/stateMachine.ts`
- `src/agent/core/templateResolver.ts`
- `src/agent/core/orchestrator.ts`
- `src/agent/planner/RulePlanner.ts`
- `src/agent/tools/toolRegistry.ts`
- `src/agent/tools/contextTools.ts`
- `src/agent/memory/feedbackStore.ts`

핵심 구조:

- `AgentTaskRecord`: task 단위 상태 저장
- `AgentTaskStepRecord`: step 단위 상태 저장
- `AgentOrchestrator`: 계획 생성, 비동기 실행, retry, review 담당
- `RulePlanner`: 현재는 deterministic한 규칙 기반 플래너
- `TemplateResolver`: `{{step.output.field}}`, `{{input...}}` 템플릿 해석
- `ToolRegistry`: 실행 가능한 tool 목록 등록/조회
- `FeedbackStore`: 운영자 review 이력 저장

### 2.2 Agent HTTP API 추가

추가 경로:

- `src/routers/agentRouter.ts`
- `src/agent/http/agentController.ts`
- `src/validation/agentSchemas.ts`

도입 API:

- `POST /agent/tasks`
- `GET /agent/tasks/:taskId`
- `POST /agent/tasks/:taskId/retry`
- `POST /agent/tasks/:taskId/review`

앱 연결:

- `src/app.ts`에서 `app.use('/agent', agentRouter)` 추가

### 2.3 조회 응답 보강

`GET /agent/tasks/:taskId`에서 다음을 확인할 수 있게 했다.

- task 상태
- step 목록
- step별 상태/오류/출력
- 진행 요약(`progress`)
- review 이력(`feedback`)

즉, 문서의 "상태·진행률·중간 결과 조회" 요구를 현재 코드 수준에서 바로 확인할 수 있게 만들었다.

## 3. 왜 이 방안을 택했는가

## 3.1 기존 `src/core`를 확장하지 않고 `src/agent/*`를 분리한 이유

선택한 방안:

- clip 비동기 처리(`src/core/*`)와 agent orchestration(`src/agent/*`)를 분리했다.

이유:

1. `Phase 0`의 비동기 clip task는 "단일 작업 비동기화"에 가깝고,
   `Phase 1`의 agent task는 "plan-step-review-retry" 구조다.
2. 둘을 같은 계층에 섞으면 task 의미가 충돌한다.
3. 이후 `Phase 2`의 provider 계층, `Phase 3`의 workflow 계층을 붙일 때 agent 전용 디렉터리가 있어야 확장이 쉽다.

적용하지 않은 대안:

- 기존 `src/core/taskStore.ts`를 공용 task store로 일반화하는 방안

배제 이유:

- 현재 시점에서는 공용화보다 의미 분리가 더 중요하다.
- 너무 일찍 추상화하면 `clip task`와 `agent task`의 lifecycle 차이를 감춘다.

## 3.2 DynamoDB나 BullMQ를 바로 넣지 않고 in-memory store로 시작한 이유

선택한 방안:

- `taskStore`, `stepStore`, `feedbackStore`를 모두 in-memory로 구현했다.

이유:

1. 문서상 Phase 1 목표는 "비동기 실행 분리"와 "상태 추적 가능성"이다.
2. 지금 가장 먼저 검증해야 하는 것은 저장 기술이 아니라 lifecycle 설계다.
3. 영속 저장소를 먼저 붙이면 실패 원인이 orchestration인지 infra인지 분리하기 어렵다.

적용하지 않은 대안:

- DynamoDB 기반 `AgentTasks`, `AgentTaskSteps` 테이블 즉시 도입
- Redis/BullMQ 기반 job queue 즉시 도입

배제 이유:

- 지금 단계에서 운영 인프라를 먼저 늘리면 구현 복잡도만 증가한다.
- 상태 전이와 API 계약이 아직 고정되지 않았기 때문에, 먼저 메모리 기반으로 모델을 검증하는 편이 맞다.

## 3.3 LLM planner 대신 규칙 기반 `RulePlanner`를 둔 이유

선택한 방안:

- `AUTO_PRODUCT_FROM_VIDEO`, `AUTO_PRODUCT_FROM_CLIP` 두 taskType에 대해 deterministic한 plan을 생성하도록 했다.

이유:

1. 현재 프로젝트는 agent 도입 초기 단계다.
2. 지금 필요한 것은 "자율성"이 아니라 "관측 가능성"이다.
3. planner가 비결정적이면 실패 원인이 입력인지, 모델인지, tool 호출인지 추적이 어려워진다.

적용하지 않은 대안:

- LLM 기반 planner를 즉시 도입하는 방안

배제 이유:

- Phase 2 이전에는 모델 정책, structured output, evaluation 체계가 없다.
- 지금 넣으면 agent 품질보다 디버깅 난이도만 올라간다.

## 3.4 전역 에러 미들웨어 대신 controller 단 try/catch를 둔 이유

선택한 방안:

- `agentController` 안에서 명시적으로 에러를 잡고 HTTP 코드로 매핑했다.

이유:

1. 현재 서버는 Express 4 기반이다.
2. Express 4는 `async` handler의 rejected promise를 자동으로 안전하게 처리하지 않는다.
3. 이번 Phase 범위는 agent API이므로, 전역 에러 리팩터링보다 agent 경로를 먼저 안정화하는 편이 맞다.

적용하지 않은 대안:

- 앱 전체에 전역 async wrapper, global error middleware 도입

배제 이유:

- 장기적으로는 필요하지만, 이번 Phase 범위를 넘어선다.
- 기존 route 전반을 한 번에 건드리면 Phase 1의 검증 범위가 불필요하게 커진다.

## 4. 주요 개선점

## 4.1 요청-응답과 실제 작업 실행이 분리됨

`POST /agent/tasks`는 즉시 `202`를 반환하고, 실제 실행은 `setImmediate` 기반 비동기 경로에서 처리한다.

개선 효과:

- 긴 작업이 요청 lifecycle을 점유하지 않는다.
- 향후 queue 기반 구현으로 교체하기 쉬운 형태가 됐다.

## 4.2 Step 단위 추적 가능

각 step에 대해 다음이 저장된다.

- `status`
- `input`
- `output`
- `error`
- `retryCount`
- `startedAt`
- `finishedAt`

개선 효과:

- 어디서 실패했는지 즉시 파악 가능
- retry 시 어느 단계부터 재실행했는지 확인 가능

## 4.3 Human-in-the-loop 구조가 명시화됨

정상 실행이 끝나면 task는 `NEEDS_REVIEW`로 간다.  
운영자는 `approve`, `edit`, `reject` 중 하나로 review를 기록할 수 있다.

개선 효과:

- "완전 자동 저장" 대신 승인형 반자동 agent 구조 확보
- 비즈니스 데이터 저장 전 품질 통제 가능

## 4.4 진행률과 review 이력이 조회 가능

`GET /agent/tasks/:taskId`에서 아래를 바로 확인 가능하다.

- 전체 step 수
- 완료/실패/대기/실행 중 step 수
- completion ratio
- review feedback 이력

개선 효과:

- 운영자 화면이나 Admin UI에서 즉시 소비 가능한 응답 형태가 됐다.

## 4.5 Retry 정합성 보강

초기 구현에서는 잘못된 `fromStepId`를 넣어도 내부적으로 0번째 step부터 다시 실행될 수 있었다.  
이번에 이를 명시적으로 막았다.

보완 내용:

- 존재하지 않는 step 재시도 요청은 즉시 에러 처리
- controller에서 `400 Invalid retry request`로 변환
- retry 시 이전 `result`, `review`, `error`를 초기화

개선 효과:

- 잘못된 운영자 조작이나 UI 버그가 task 상태를 왜곡하지 않음

## 5. 완료 기준 기준 자체 검토

## 5.1 기준 1: task 생성 후 비동기 실행 가능

판정: 충족

근거:

- `AgentOrchestrator.startTask()`에서 task를 저장한 뒤 `setImmediate`로 비동기 실행 시작
- `POST /agent/tasks`는 즉시 `202` 반환
- 테스트에서 생성 직후 polling으로 `NEEDS_REVIEW`까지 상태 전이 확인

## 5.2 기준 2: 단계별 상태/오류/출력 확인 가능

판정: 충족

근거:

- `stepStore`에 step별 `status`, `output`, `error`, `retryCount` 저장
- `getTaskDetails()`에서 task + steps + progress + feedback 반환
- 실패 후 `FAILED`, retry 후 `NEEDS_REVIEW` 복구 케이스를 테스트로 확인

## 6. 테스트 및 검증 결과

실행한 명령:

```bash
npm run test:phase1
npm run test:phase0
```

### 6.1 Phase 1 테스트 결과

결과: 통과

- `agent-api-contract.test.js`
  - route 구성 확인
  - create/review schema 검증 확인
- `controller-error-handling.test.js`
  - retry/state 에러가 명시적 HTTP 응답으로 변환되는지 확인
- `orchestrator-lifecycle.test.js`
  - 비동기 실행, `NEEDS_REVIEW`, progress, feedback 확인
- `retry-flow.test.js`
  - 실패 step 재시도와 retryCount 증가 확인

총 4개 테스트 통과.

### 6.2 Phase 0 회귀 테스트 결과

결과: 통과

- 기존 `test:phase0` 5개 테스트 전부 통과

의미:

- Agent Phase 1 추가가 Phase 0 안정화 작업을 깨지 않았음

## 7. 구현 중 발견한 문제와 보완 내용

## 7.1 잘못된 step 재시도 요청이 조용히 첫 단계 재실행으로 바뀌는 문제

원인:

- `fromStepId`가 plan에 없을 때도 내부 인덱스 계산이 `-1 -> 0`으로 흘러갔다.

보완:

- retry 대상 step 존재 여부를 명시적으로 검증
- 없으면 `Retry step not found` 에러 발생
- controller에서 `400` 응답으로 변환

## 7.2 조회 응답에 진행 요약과 review history가 부족했던 문제

원인:

- 최초 구현은 `task`, `steps`만 반환했다.

보완:

- `progress` 계산 추가
- `feedbackStore` 조회 결과 포함

## 7.3 Agent API에서 async error가 누락될 수 있는 문제

원인:

- Express 4에서 async handler rejected promise를 전역에서 안전하게 다루는 구조가 없었다.

보완:

- `agentController`에서 try/catch로 명시적 에러 매핑
- `404`, `400`, `409`, `500` 응답 분리

## 8. 현재 한계

이번 Phase는 intentionally lightweight하다. 아직 없는 것:

- 영속 task store
- queue/worker 분리
- evidence API
- automatic backoff retry policy
- verifier agent
- LLM provider abstraction

즉, 지금 상태는 "운영 가능한 최소 agent 뼈대"이지, 최종 agent 시스템은 아니다.

## 9. 다음 Phase로 넘길 수 있는 상태인가

판정: 가능

이유:

1. task lifecycle이 고정됐다.
2. review/retry API 계약이 생겼다.
3. Phase 2의 provider 계층을 이 구조 위에 붙일 수 있다.

따라서 다음 단계는 `Phase 2. 모델 호출 계층 재설계`로 넘어가면 된다.  
특히 `chatGpt.ts`를 직접 부르지 않고, `src/agent/providers/llm/*` 계층으로 분리하는 작업을 시작할 수 있다.
