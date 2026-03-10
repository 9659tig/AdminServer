# Phase 2 Implementation Report

기준 문서: `AI_AGENT_DIRECTION_AND_MODEL_REVIEW.md`

## 1. Phase 2 목표 재확인

문서상 Phase 2 목표는 다음과 같았다.

1. 현재 `chatGpt.ts`를 agent 친화적인 provider 계층으로 전환
2. `OpenAIProvider`와 `modelPolicy` 도입
3. structured output 검증 도입
4. 모델 라우팅 정책 구현

완료 기준은 하나로 정리된다.

- 같은 workflow 안에서 모델 교체가 코드 수정 없이 정책으로 가능해야 한다.

이번 구현은 이 기준을 충족시키는 최소한의 안전한 경계를 만드는 데 집중했다.

## 2. 이번 Phase에서 실제로 구현한 것

### 2.1 LLM provider 계층 추가

추가 파일:

- `src/agent/providers/llm/types.ts`
- `src/agent/providers/llm/modelPolicy.ts`
- `src/agent/providers/llm/OpenAIProvider.ts`

핵심 역할:

- `types.ts`
  - provider 요청/응답 타입 정의
  - mock client 테스트를 위한 최소 OpenAI client 인터페이스 정의

- `modelPolicy.ts`
  - 모델 별칭(`mini-default`, `4o-escalation`, `transcribe-default`) 정의
  - 정책별 mode(`chat`, `transcription`) 및 기본 temperature, maxOutputTokens 정의
  - registry 기반 resolve 구조 제공

- `OpenAIProvider.ts`
  - `generateText()`
  - `generateObject()`
  - `transcribe()`
    세 가지 호출을 하나의 계층으로 통합

### 2.2 기존 `chatGpt.ts`를 provider 기반으로 교체

수정 파일:

- `src/config/chatGpt.ts`

변경 전:

- `gpt-3.5-turbo` 문자열이 파일 안에 하드코딩
- 자유 텍스트 응답만 반환
- structured output 보장이 없음

변경 후:

- `OpenAIProvider.generateObject()` 사용
- `mini-default` 정책 별칭 사용
- `zod` schema로 `productName` 구조 검증
- 기존 `productController`는 그대로 두고 adapter만 교체

즉, 기존 호출자 API를 깨지 않고 내부 호출 방식을 교체했다.

## 3. 왜 이 방안을 택했는가

## 3.1 모델명을 각 도구/컨트롤러에 직접 쓰지 않고 `modelPolicy`를 둔 이유

선택한 방안:

- 모델 선택은 모두 정책 별칭으로만 하게 만들었다.

이유:

1. `gpt-4o-mini`, `gpt-4o`, `gpt-4o-mini-transcribe`는 역할이 다르다.
2. 향후 모델 교체는 빈번하게 일어날 수 있다.
3. 모델 문자열이 여기저기 흩어지면 교체 시 누락과 회귀 위험이 커진다.

적용하지 않은 대안:

- 각 tool이나 config 파일에서 모델명을 직접 하드코딩

배제 이유:

- 이번 Phase 목표 자체가 "코드 수정 없이 정책으로 모델 교체"다.
- 하드코딩은 목표와 정면으로 충돌한다.

## 3.2 최신 SDK parse API 업그레이드보다, 현재 SDK 위에서 client-side schema 검증을 넣은 이유

선택한 방안:

- `chat.completions.create()` + `response_format: { type: 'json_object' }` + `zod.safeParse()` 조합을 사용했다.

이유:

1. 현재 프로젝트의 OpenAI SDK는 `^4.15.0`이다.
2. 지금 당장 중요한 것은 SDK 최신 기능 채택보다 provider 경계 확립이다.
3. structured output의 핵심은 "모델이 JSON을 주느냐"보다 "서버가 schema로 검증하느냐"다.

적용하지 않은 대안:

- SDK를 즉시 올리고 최신 parse helper까지 한 번에 도입

배제 이유:

- dependency 변경과 API 변경을 동시에 하면 원인 분리가 어려워진다.
- 이 단계에서는 안정성이 더 중요하다.

## 3.3 기존 `productController`를 바꾸지 않고 `chatGpt.ts` adapter를 유지한 이유

선택한 방안:

- 기존 `productController`는 유지하고, 내부 adapter만 교체했다.

이유:

1. `/productName` API 계약은 이미 Phase 0에서 안정화했다.
2. 이번 Phase 목표는 provider abstraction이지, product API 재설계가 아니다.
3. 하위 계층만 교체하면 회귀 범위가 작다.

적용하지 않은 대안:

- `productController`를 직접 provider 호출 형태로 전면 교체

배제 이유:

- 불필요하게 호출자까지 바꾸면 Phase 2 검증 범위가 커진다.

## 3.4 env schema에 새 모델 변수들을 강제하지 않은 이유

선택한 방안:

- 모델 override는 optional env(`OPENAI_MODEL_MINI_DEFAULT`, `OPENAI_MODEL_4O_ESCALATION`, `OPENAI_MODEL_TRANSCRIBE_DEFAULT`)로 읽되, 필수값으로 강제하지 않았다.

이유:

1. 모델 정책의 기본값만으로도 동작해야 한다.
2. Phase 0의 fail-fast env 원칙은 "필수 비밀값"에 집중하는 것이 맞다.
3. 모델명 override까지 필수화하면 운영 마이그레이션 비용만 늘어난다.

## 4. 주요 개선점

## 4.1 모델 교체 경계가 생김

이제 소비자 코드는 모델명을 직접 알 필요가 없다.

예:

- `mini-default`
- `4o-escalation`
- `transcribe-default`

개선 효과:

- workflow 코드는 그대로 두고 policy만 바꿔 모델을 교체할 수 있다.

## 4.2 텍스트 / JSON / 전사 호출이 하나의 provider 계층으로 정리됨

이전에는 OpenAI 사용이 단일 문자열 호출에 갇혀 있었다.  
이제는 다음 세 가지 모드를 같은 계층에서 다룬다.

- 자유 텍스트
- structured object
- transcription

개선 효과:

- Phase 3의 Vision/Transcript/Search workflow에서 동일한 호출 패턴을 재사용할 수 있다.

## 4.3 structured output 검증이 서버 책임으로 올라옴

이전에는 모델이 무엇을 반환해도 문자열이면 통과했다.  
이제는 JSON을 파싱하고 `zod` schema로 검증한다.

개선 효과:

- 잘못된 shape가 들어와도 조용히 downstream으로 흘러가지 않는다.
- 응답 드리프트를 조기에 차단할 수 있다.

## 4.4 기존 `/productName` 경로도 Phase 2 구조를 사용하게 됨

`chatGpt.ts` adapter를 교체하면서, 기존 엔드포인트도 provider 계층을 통하게 됐다.

개선 효과:

- 새 구조가 agent 전용 코드에만 머물지 않고 기존 API에도 적용됐다.
- 실제 서비스 코드에서 provider abstraction이 이미 검증되기 시작했다.

## 5. 완료 기준 검토

## 5.1 기준: 같은 workflow 안에서 모델 교체가 코드 수정 없이 정책으로 가능

판정: 충족

근거:

1. `OpenAIProvider`는 `policy`만 받아 실제 모델명은 `modelPolicyRegistry.resolve()`로 결정한다.
2. 테스트에서 `mini-default`를 `test-mini-model`로 override해도 호출 코드는 바꾸지 않았다.
3. `chatGpt.ts` 역시 모델명이 아니라 `mini-default` 정책만 사용한다.

즉, 소비자 코드는 정책 이름만 고정하고, 실제 모델 라우팅은 registry가 담당한다.

## 6. 테스트 및 검증 결과

실행한 명령:

```bash
npm run test:phase2
npm run test:phase0
npm run test:phase1
```

### 6.1 Phase 2 테스트 결과

결과: 통과

- `model-policy.test.js`
  - policy registry가 alias를 올바르게 resolve하는지 확인
  - override만으로 모델 교체가 되는지 확인

- `openai-provider.test.js`
  - `generateText()`가 policy model을 사용하는지 확인
  - `generateObject()`가 JSON schema를 검증하는지 확인
  - `transcribe()`가 `transcribe-default` 정책을 사용하는지 확인

- `chatgpt-adapter.test.js`
  - 기존 adapter가 provider 기반 structured output을 사용해 product name을 반환하는지 확인

총 4개 테스트 통과.

### 6.2 회귀 테스트 결과

결과: 통과

- Phase 0: 5개 테스트 통과
- Phase 1: 4개 테스트 통과

의미:

- Phase 2 provider 계층 추가가 기존 안정화/agent 코어를 깨지 않았다.

## 7. 구현 중 고려한 리스크와 대응

## 7.1 structured output이 잘못된 JSON을 반환할 수 있는 리스크

대응:

- JSON code fence 제거
- JSON parse 실패 시 즉시 에러
- schema validation 실패 시 즉시 에러

즉, "JSON처럼 보이는 문자열"을 신뢰하지 않도록 했다.

## 7.2 transcription 정책을 미리 정의만 하고 실제 사용처가 아직 없는 리스크

대응:

- Phase 3의 STT workflow를 고려해 provider API 수준에서 먼저 지원했다.
- 아직 소비자는 없지만, 호출 인터페이스와 정책 구조는 미리 고정했다.

## 7.3 기존 OpenAI 호출과 새 호출 방식이 이중화될 리스크

대응:

- 기존 `chatGpt.ts`를 직접 provider 기반으로 교체했다.
- 새 구조와 레거시 구조가 동시에 남지 않게 했다.

## 8. 현재 한계

이번 Phase는 provider 계층 정리에 집중했다. 아직 없는 것:

- 멀티모달 이미지 입력 호출
- function calling 기반 tool orchestration
- provider fallback 체인
- latency/cost metrics
- 모델별 confidence calibration

즉, 지금 단계는 "모델 호출 레이어 정리"이지 "상품 식별 workflow 완성"이 아니다.

## 9. 다음 Phase로 넘길 수 있는 상태인가

판정: 가능

이유:

1. LLM 호출 경계가 고정됐다.
2. structured output 검증 경로가 생겼다.
3. Phase 3의 `VisionProductTool`, `TranscriptExtractTool`이 이 provider 계층을 바로 사용할 수 있다.

따라서 다음 단계는 `Phase 3. v1 Workflow 도입`으로 넘어가도 된다.  
이제 실제 상품 추출 workflow를 `provider + task/orchestrator` 위에 붙일 수 있다.
