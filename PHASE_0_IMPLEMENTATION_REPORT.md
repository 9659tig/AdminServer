# Phase 0 구현 보고서

범위: Phase 0 착수 및 완료 검토

## 1. Phase 0 목표

Phase 0의 목표는 AI agent를 바로 올리는 것이 아니라, 현재 AdminServer를 agent 도입 가능한 상태로 정리하는 것이다.
이번 작업에서는 다음 5가지를 실제 코드로 반영했다.

1. 전역 상태 제거
2. API 계약 정합화
3. 입력 검증 + requestId + 구조화 로그
4. 필수 env 검증
5. 장시간 작업의 비동기 분리 준비

## 2. 이번에 적용한 방식과 그 이유

## 2.1 전역 상태 제거

문제:

- 기존 `videoController.ts`의 `videoInfoDetail`을 `clipController.ts`가 전역으로 공유했다.
- 동시 요청 시 서로 다른 영상 메타데이터가 섞일 수 있었다.

적용한 방식:

- `/clip` 요청이 `videoUrl`을 함께 받도록 바꿨다.
- 클립 백그라운드 작업에서 `videoInformation(videoUrl)`를 다시 호출해 서버가 직접 `videoInfoDetail`을 재계산하도록 변경했다.

이 방식을 선택한 이유:

- 클라이언트가 `videoInfoDetail` 전체를 보내는 방식은 신뢰할 수 없는 입력을 서버가 그대로 저장하게 만든다.
- 세션/서버 캐시 방식은 Phase 1의 task 기반 저장소와 겹치므로 지금 시점에는 과하다.
- 원본 `videoUrl`만 전달받고 서버가 다시 canonical metadata를 계산하는 방식이 가장 안전하고 단순하다.

개선점:

- 요청 간 상태 오염 제거
- 클립 생성 입력이 자체적으로 완결됨

## 2.2 API 계약 정합화

문제:

- `/productName`가 `GET`인데 `req.body`를 읽고 있었다.
- `add_creator.js`는 `application/x-www-form-urlencoded`로 보내면서 `links` 배열은 실질적으로 누락하고 있었다.
- `addInfluencerInfo`는 `links.length == 5`를 강제하고 있었다.

적용한 방식:

- `/productName`를 `POST` JSON 계약으로 전환
- `add_creator.js`를 JSON 전송으로 변경
- `links.length == 5` 하드코딩 제거
- `links`는 실제 입력된 값만 서버로 보내고, 서버가 YouTube 링크를 추가하도록 유지

이 방식을 선택한 이유:

- 배열/중첩 구조를 다루는 API는 `form-urlencoded`보다 JSON 계약이 명확하다.
- 현재 관리자 화면은 링크 입력이 선택적이다. 최소 5개를 강제하는 것은 UI와 서버가 서로 다른 가정을 가진 상태다.

개선점:

- 프론트엔드와 백엔드 계약 일치
- `links` 입력 누락으로 인한 런타임 오류 제거

## 2.3 입력 검증

적용한 방식:

- `zod`를 도입해 `src/validation/schemas.ts`에 라우트별 스키마를 정의
- `validateBody`, `validateQuery`, `validateParams` 미들웨어 추가

이 방식을 선택한 이유:

- 기존처럼 각 컨트롤러가 직접 `if (!value)`로 검사하면 중복이 많고, 숫자/불리언 coercion이나 배열 스키마 검증이 약하다.
- Phase 0에서는 "모든 라우트의 완전한 정제"보다 "계약이 자주 깨지는 경로를 구조적으로 고정"하는 것이 우선이라 미들웨어 방식이 맞다.

개선점:

- 라우터 단에서 실패
- 컨트롤러 로직 단순화
- Phase 1 이후 OpenAPI/agent task schema와 연결하기 쉬운 구조 확보

## 2.4 requestId + 구조화 로그

적용한 방식:

- `requestContextMiddleware` 추가
- `x-request-id`가 있으면 보존, 없으면 생성
- `req.log`에 requestId가 포함된 구조화 로그 객체 주입

이 방식을 선택한 이유:

- `pino` 같은 전용 로거를 추가하는 것도 가능했지만, Phase 0에서는 외부 로깅 인프라보다 request traceability 확보가 더 중요했다.
- 커스텀 JSON logger는 의존성을 늘리지 않고 바로 적용 가능했다.

개선점:

- 요청 단위 추적 가능
- 백그라운드 clip task도 requestId와 연결 가능

## 2.5 env 검증

적용한 방식:

- `src/config/env.ts`에서 `zod` 기반 환경변수 검증 추가
- `secret.ts`는 더 이상 `process.env`를 직접 읽지 않고 검증된 env를 사용

이 방식을 선택한 이유:

- 기존에는 잘못된 env가 있어도 앱이 부분적으로 부팅한 뒤, 외부 API 호출 시 늦게 실패했다.
- agent 구조에서는 실패 지점을 늦게 발견할수록 추적 비용이 커지므로 fail-fast가 필수다.

개선점:

- 누락된 env를 시작 시점에 명확한 에러로 차단
- config 접근 지점 단일화

## 2.6 장시간 작업 비동기 분리 준비

적용한 방식:

- `/clip`은 이제 즉시 `202`와 `taskId`를 반환
- 실제 작업은 `setImmediate` 기반 백그라운드 처리로 이동
- Phase 0 수준의 `InMemoryTaskStore`를 추가

이 방식을 선택한 이유:

- 바로 SQS/BullMQ 같은 정식 큐를 넣는 것은 Phase 1 범위다.
- 하지만 Phase 0에서도 "요청 스레드에서 수십 초 작업" 구조는 깨야 하므로, 최소한의 task envelope를 먼저 도입했다.

개선점:

- `/clip` 응답 시간 단축
- 이후 `AgentTasks`/worker 구조로 자연스럽게 확장 가능

## 3. 실제 변경 파일

핵심 변경:

- `src/app.ts`
- `src/config/env.ts`
- `src/config/logger.ts`
- `src/config/secret.ts`
- `src/middleware/requestContext.ts`
- `src/middleware/validate.ts`
- `src/core/taskStore.ts`
- `src/core/clipTaskProcessor.ts`
- `src/validation/schemas.ts`
- `src/controllers/videoController.ts`
- `src/controllers/clipController.ts`
- `src/controllers/influencerController.ts`
- `src/controllers/productController.ts`
- `src/routers/router.ts`
- `src/public/add_creator/add_creator.js`
- `src/public/video_trimmer/video.js`

테스트/운영 보조:

- `tests/phase0/*`
- `package.json`

## 4. 완료 기준 검토

## Gate 1. 전역 상태 제거

판정: 완료

근거:

- `videoController.ts`의 전역 `videoInfoDetail` export 제거
- `/clip`이 자체 입력(`videoUrl`)로 서버 내에서 메타데이터를 다시 계산

## Gate 2. API 계약 정합화

판정: 완료

근거:

- `/productName` -> `POST`
- influencer 저장 요청 -> JSON
- `links.length == 5` 제거
- 라우터 레벨 zod 스키마 적용

## Gate 3. requestId + 구조화 로그

판정: 완료

근거:

- requestId 미들웨어 적용
- `x-request-id` 응답 헤더 설정
- 주요 경로에서 `req.log` 사용

## Gate 4. env fail-fast

판정: 완료

근거:

- env 누락 시 `[STARTUP ERROR] Missing or invalid env vars: ...` 형태로 실패

## Gate 5. 비동기 분리 준비

판정: 완료

근거:

- `/clip`이 `202 + taskId` 반환
- 실제 clip 생성은 백그라운드 작업으로 이동

## 5. 테스트 결과

실행 명령:

```bash
npm run test:phase0
```

최종 결과:

- 5개 테스트 통과

포함된 테스트:

- `env-check.test.js`
- `request-id.propagation.test.js`
- `api-contract.test.js`
- `global-state.concurrency.test.js`
- `async-response.test.js`

## 6. 테스트 중 발생한 문제와 보완

1. 초기 빌드 실패

- 원인: 새 logger 타입이 `unknown` 에러 객체를 허용하지 않았고, `tests/`가 TypeScript 컴파일 범위에 포함됨
- 조치:
  - logger 메타 타입 완화
  - `tsconfig.json`에서 `tests` 제외

2. 포트 기반 테스트 실패

- 원인: 샌드박스 환경이 `listen()`을 막아 `EPERM` 발생
- 처음 시도: 포트 기반 integration test
- 최종 조치:
  - Express 서버를 실제로 띄우지 않고, middleware/handler를 직접 호출하는 mock 기반 테스트로 전환

이 결정을 한 이유:

- 문제는 애플리케이션 코드가 아니라 테스트 환경 제약이었다.
- Phase 0 완료 기준은 "요청 흐름/검증/비동기 응답 계약"을 확인하는 것이므로, socket-less 테스트가 더 직접적이고 안정적이다.

## 7. 남은 한계

1. `InMemoryTaskStore`는 임시 구조다.

- 프로세스 재시작 시 상태가 사라진다.
- Phase 1에서 영속 task store로 교체해야 한다.

2. `/clip` 성공/실패를 UI가 task 상태로 조회하지는 않는다.

- 현재 화면은 기존처럼 S3 결과를 폴링한다.
- Phase 1에서 task 조회 API로 이어가야 한다.

3. 모든 기존 라우트가 완전히 통일된 schema-first 구조로 바뀐 것은 아니다.

- Phase 0에서는 실제로 깨지던 경로와 agent 선행조건 경로를 우선 정리했다.

## 8. 다음 단계

Phase 0는 완료됐다.
다음은 Phase 1로 넘어가 아래를 구현하면 된다.

1. 영속 `AgentTasks` 저장소
2. `POST /agent/tasks`, `GET /agent/tasks/:taskId`
3. background task와 상태 조회의 정식 연결
4. clip 외 작업도 task 단위로 확장
