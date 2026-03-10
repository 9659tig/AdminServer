# Phase 3 Implementation Report

기준 문서: `AI_AGENT_DIRECTION_AND_MODEL_REVIEW.md`

## 1. Phase 3 목표 재확인

문서상 Phase 3 목표는 다음과 같았다.

1. Google Lens 의존 없는 첫 번째 상품 추출 workflow 구축
2. `VisionProductTool`
3. `TranscriptExtractTool`
4. `ShoppingSearchTool`
5. `ProductExtractionWorkflow`

완료 기준은 두 가지였다.

- 기존 `/product` 경로와 병행 비교 가능
- 결과에 `confidence`와 `evidence` 포함

이번 구현은 이 두 기준을 현재 코드베이스에 맞는 v3-lite 형태로 충족시키는 데 집중했다.

## 2. 이번 Phase에서 실제로 구현한 것

### 2.1 멀티모달 provider 입력 지원

수정 파일:

- `src/agent/providers/llm/types.ts`
- `src/agent/providers/llm/OpenAIProvider.ts`

추가 내용:

- text + image URL을 함께 보낼 수 있는 `messages` 기반 입력 지원
- 기존 `userPrompt` 기반 호출은 유지

이 변경이 필요한 이유는 `VisionProductTool`이 실제로 image URL을 provider에 전달해야 했기 때문이다.

### 2.2 상품 추출용 도구/워크플로우 추가

추가 파일:

- `src/agent/tools/VisionProductTool.ts`
- `src/agent/tools/TranscriptExtractTool.ts`
- `src/agent/tools/ShoppingSearchTool.ts`
- `src/agent/workflows/ProductExtractionWorkflow.ts`
- `src/agent/workflows/productTypes.ts`

역할:

- `VisionProductTool`
  - image URL 기반 시각 상품 후보 추출
  - `mini-default` 1차
  - low confidence면 `4o-escalation` 재판정

- `TranscriptExtractTool`
  - `spokenText`가 있으면 즉시 사용
  - `clipLink`가 있으면 clip 자산을 내려받아 `transcribe-default`로 전사 가능
  - 둘 다 없으면 실패 대신 `unavailable`로 반환

- `ShoppingSearchTool`
  - Coupang 검색 API 호출
  - 기존 `generateHmac` 재사용
  - 응답 normalize + 리뷰 수 기반 정렬

- `ProductExtractionWorkflow`
  - 규칙 기반 반결정형 흐름
  - `vision -> transcript(if needed) -> shopping -> finalize`
  - 결과에 `confidence`, `evidence`, `legacyComparison` 포함

### 2.3 Planner/Registry/Schema 통합

수정 파일:

- `src/agent/planner/RulePlanner.ts`
- `src/agent/core/orchestrator.ts`
- `src/agent/tools/contextTools.ts`
- `src/agent/core/types.ts`
- `src/validation/agentSchemas.ts`

변경 내용:

- 새 workflow tool 등록
- clip task는 `product_extraction_workflow`를 사용
- video task는 clip evidence가 들어온 경우에만 workflow 사용
- 입력 schema에 `spokenText`, `clipLink`, `legacyCandidates` 추가

## 3. 왜 이 방안을 택했는가

## 3.1 자유 루프 agent가 아니라 단일 workflow tool로 묶은 이유

선택한 방안:

- planner는 `product_extraction_workflow`를 하나의 deterministic step으로 실행하게 했다.

이유:

1. 지금 중요한 것은 "자율성"보다 "재현 가능성"이다.
2. vision, transcript, shopping을 planner가 자유롭게 반복 호출하게 하면 디버깅 경계가 흐려진다.
3. retry 단위도 workflow 전체로 잡는 편이 현재 운영 단계에 더 안전하다.

적용하지 않은 대안:

- planner가 각 tool을 독립 step으로 여러 번 호출하는 자유 루프 구조

배제 이유:

- 지금 단계에서는 실패 원인 분리가 더 어렵다.
- 평가와 복구 자동화가 없는 상태에서 자율 루프를 먼저 넣는 것은 과하다.

## 3.2 `AUTO_PRODUCT_FROM_VIDEO`를 전부 새 workflow로 바꾸지 않은 이유

선택한 방안:

- `AUTO_PRODUCT_FROM_CLIP`은 새 workflow를 사용
- `AUTO_PRODUCT_FROM_VIDEO`는 clip evidence가 있을 때만 workflow를 사용
- evidence가 없으면 기존 단순 Phase 1 경로를 유지

이유:

1. 현재 video task 입력은 기본적으로 `videoUrl`만 있고, image/transcript evidence가 없다.
2. evidence 없는 상태에서 상품 추출 workflow를 강제하면 false confidence만 생긴다.
3. 기존 Phase 1 경로를 유지해야 회귀 위험을 줄일 수 있다.

적용하지 않은 대안:

- 모든 video task를 일괄적으로 Phase 3 workflow로 전환

배제 이유:

- 현재 입력 계약으로는 충분한 근거가 없다.
- 실제 상품 추출은 clip 단위 evidence가 더 자연스럽다.

## 3.3 Transcript 도구에서 YouTube captions API를 바로 붙이지 않은 이유

선택한 방안:

- `spokenText` 또는 `clipLink` 기반 전사 경로를 우선 구현했다.

이유:

1. 현재 프로젝트의 YouTube 연동은 API key 중심이다.
2. 자막 조회/다운로드는 OAuth, 접근 권한, availability 이슈가 있어 현재 구조에 바로 맞지 않는다.
3. 자막을 "지원하는 척" 하는 것보다, 현재 연결 가능한 전사 경로를 명시적으로 두는 편이 맞다.

적용하지 않은 대안:

- YouTube captions API를 즉시 정식 경로로 추가

배제 이유:

- 현재 인증 구조와 맞지 않고, 실패 모드가 더 복잡해진다.

## 3.4 `/product` 병행 비교를 새 endpoint가 아니라 `legacyCandidates` 입력으로 연 이유

선택한 방안:

- task 입력에 `legacyCandidates`를 넣으면 workflow 결과에 `legacyComparison`이 생성되도록 했다.

이유:

1. Phase 3 완료 기준은 "비교 가능성" 확보이지, 운영용 dual-run UI 완성이 아니다.
2. live traffic 이중 실행은 Phase 4에서 다루는 편이 맞다.
3. 지금은 task 단위로 기존 후보와 agent 후보를 나란히 비교할 수 있으면 충분하다.

적용하지 않은 대안:

- `/product`와 agent workflow를 동시에 호출하는 별도 dual-run API 즉시 도입

배제 이유:

- 그건 Phase 4 병행 운영 범위다.
- 지금 단계에서 API/운영 화면까지 같이 늘리면 검증 포인트가 과도하게 커진다.

## 4. 주요 개선점

## 4.1 Google Lens 스크래핑 의존을 우회할 수 있는 첫 경로가 생김

이제 clip task는 image URL 기반 vision 경로로 상품 후보를 만들 수 있다.

개선 효과:

- DOM selector 변경에 취약한 기존 `/product` 스크래핑과 별도의 대체 경로 확보

## 4.2 low-confidence fallback 구조가 생김

Vision confidence가 낮으면 transcript를 보강 근거로 사용한다.

개선 효과:

- 애매한 시각 장면에서 근거가 하나 더 생긴다.
- 바로 실패하지 않고 `NEEDS_REVIEW`로 품질 저하를 격리할 수 있다.

## 4.3 결과가 explanation-friendly 해짐

Workflow 결과에는 아래가 포함된다.

- `confidence`
- `selectedProduct`
- `allCandidates`
- `shoppingResults`
- `evidence`
- `legacyComparison`
- `fallbackReason`

개선 효과:

- 운영자가 왜 이 후보가 나왔는지 추적 가능
- 이후 평가 데이터셋으로 전환하기 쉬움

## 4.4 Coupang 검색이 workflow 안으로 흡수됨

기존 HMAC 생성 로직은 utility로만 남아 있었고, 실제 검색 tool이 없었다.  
이번 Phase에서 이를 workflow 안의 shopping 단계로 묶었다.

개선 효과:

- 상품명 후보에서 실제 구매 링크 후보까지 한 흐름 안에서 생성 가능

## 5. 완료 기준 검토

## 5.1 기준 1: 기존 `/product` 경로와 병행 비교 가능

판정: 충족

근거:

1. 입력에 `legacyCandidates`를 전달할 수 있다.
2. workflow는 결과에 `legacyComparison`을 포함한다.
3. overlap/matched 여부를 바로 확인할 수 있다.

즉, live dual-run API는 아직 없지만 task 단위 비교는 이미 가능하다.

## 5.2 기준 2: 결과에 confidence와 evidence 포함

판정: 충족

근거:

1. `ProductExtractionWorkflow` 결과에 `confidence` 포함
2. `evidence` 배열에 `vision/transcript/shopping/legacy` 근거 포함
3. 테스트에서 low-confidence -> transcript fallback -> shopping -> evidence 생성까지 확인

## 6. 테스트 및 검증 결과

실행한 명령:

```bash
npm run test:phase3
npm run test:phase0
npm run test:phase1
npm run test:phase2
```

### 6.1 Phase 3 테스트 결과

결과: 통과

- `vision-product-tool.test.js`
  - `mini-default` low confidence 시 `4o-escalation` 호출 확인
  - image URL이 provider 메시지에 포함되는지 확인

- `product-extraction-workflow.test.js`
  - vision low confidence
  - transcript candidate 승격
  - shopping result 보강
  - `confidence`, `evidence`, `legacyComparison` 생성 확인

- `planner-and-schema.test.js`
  - clip task가 새 workflow를 사용하도록 planner가 바뀌었는지 확인
  - clip task schema가 `imageUrls` 또는 `spokenText`를 강제하는지 확인

- `shopping-search-tool.test.js`
  - Coupang 요청 서명
  - 응답 normalize 및 ranking 확인

총 5개 테스트 통과.

### 6.2 회귀 테스트 결과

결과: 통과

- Phase 0: 5개 테스트 통과
- Phase 1: 4개 테스트 통과
- Phase 2: 4개 테스트 통과

의미:

- Phase 3 workflow 추가가 기존 안정화/agent core/provider 계층을 깨지 않았다.

## 7. 구현 중 발견한 문제와 보완 내용

## 7.1 `AUTO_PRODUCT_FROM_VIDEO` 기본 경로가 기존 테스트를 깨뜨릴 수 있는 문제

원인:

- video task까지 무조건 workflow로 바꾸면 Phase 1 테스트 입력만으로는 상품 추출이 성립하지 않는다.

보완:

- video task는 clip evidence가 있을 때만 workflow 사용
- 없으면 기존 context/review 경로 유지

## 7.2 transcript source가 없을 때 workflow 전체를 실패시킬 위험

원인:

- transcript는 보강 근거이지, 항상 필수 입력은 아니다.

보완:

- `TranscriptExtractTool`은 실패 대신 `unavailable` 결과를 반환
- workflow는 그 상태를 evidence/fallbackReason으로 남기고 계속 진행

## 7.3 shopping API 실패가 task 전체 실패로 전이될 위험

원인:

- 상품 후보는 있어도 shopping 검색은 일시적으로 실패할 수 있다.

보완:

- workflow 내부에서 shopping search 실패를 잡고 `fallbackReason`으로 기록
- 결과는 `NEEDS_REVIEW`로 남기도록 설계

## 8. 현재 한계

이번 Phase는 v3-lite다. 아직 없는 것:

- live dual-run endpoint/UI
- Naver shopping source
- verifier agent
- 실제 평가 지표 수집
- transcript 정식 audio extraction pipeline 고도화

즉, 지금 상태는 "작동하는 첫 workflow"이지, 운영 최종본은 아니다.

## 9. 다음 Phase로 넘길 수 있는 상태인가

판정: 가능

이유:

1. 새 workflow 결과가 구조화되었다.
2. confidence/evidence/legacy comparison이 모두 저장 가능한 형태다.
3. 이제 Phase 4에서 dual-run, Gold Set, approve/edit/reject 데이터 적재를 붙일 수 있다.

따라서 다음 단계는 `Phase 4. 병행 운영 및 평가`로 넘어가면 된다.
