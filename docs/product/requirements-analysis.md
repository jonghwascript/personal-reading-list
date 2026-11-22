# Bookshelf 요구사항 분석

## 제품 정의

개인 독자가 책을 찾아 서재에 정리하고, 읽은 위치와 연간 목표를 기록하며, 한 해의 독서를 돌아보는 앱이다. 문서가 제시한 대상은 다독가, 목표를 세우는 독자, 책장을 꾸미는 독자, 불완전한 책 정보를 다루는 개발자 독자다. 기존 도구의 소셜 중심 경험 때문에 독자가 메모 앱이나 스프레드시트를 쓴다는 설명은 제품 문서의 문제 가정이다. 소셜 피드, 알고리즘 추천, 광고는 제품 정의에서 제외한다. [product-definition (1).md](../../requirements/product-definition%20%281%29.md) 「어떤 제품인가」, 「누구를 위한 제품인가」, 「왜 필요한가」

## 핵심 범위

풀스택 경로의 핵심 기능은 도서 검색·추가, 책장 관리, 도서 상세, 서재 대시보드, 독서 진도, 연간 목표, 반응형 디자인, 인증, 랜딩 페이지, 게스트 체험, 실제 데이터베이스 저장, 오류 및 예외 처리다. 프런트엔드 전용 경로는 인증과 별도 게스트 모드를 생략하고 브라우저 저장과 샘플 도서를 적용한다. CSV 가져오기, 내 서재 검색, 다크 모드, 장르 태그, 활동 타임라인, 일괄 작업, 추가 성능 항목은 핵심 문서에서 확장으로 분류한다. 기술 문서의 성능 목표는 별도로 적용된다. [core-requirements.md](../../requirements/core-requirements.md) §§1–19 · [technical-requirements (1).md](../../requirements/technical-requirements%20%281%29.md) 「성능 목표」, 「프런트엔드 전용 대안」

## 직접 판단할 UX

- 연간 결산은 적게 읽은 독자도 배려하며, 지표와 표현 형식, 올해와 지난 해의 구분을 직접 판단한다.
- 도서 탐색은 제목·저자·ISBN 검색과 검색 결과에서 한 번에 추가하는 핵심 흐름을 지킨다. 빈 서재 안내, 판본 표시, 큐레이션을 직접 판단한다.
- 진도는 상세 화면과 대시보드에서 갱신할 수 있어야 한다. 페이지 수가 없으면 백분율을 지원하고 100%에 도달하면 완독 책장으로 옮길지 묻는다. 입력 방식과 이력의 활용은 직접 판단한다.

근거는 [design-challenges (1).md](../../requirements/design-challenges%20%281%29.md) §§1–3과 [core-requirements.md](../../requirements/core-requirements.md) §§1·5다.

## 선택 가능한 차별화

책장·표지 애니메이션은 탐색과 정리의 즐거움, AI 독서 동반자는 자연어 검색과 기록 인사이트, 공유 카드는 외부 게시에 쓸 이미지, Goodreads 마이그레이션은 기존 기록의 이전, 통계 대시보드는 독서 습관 비교, 접근성 강화는 다양한 방식으로 기록할 편의를 제안한다. 문서는 1~2개를 권장하며 추가 가치의 실현 여부는 검증 대상이다. 외부 공유 카드는 앱 내 소셜 피드와 별개의 선택 사항이다. [differentiators (1).md](../../requirements/differentiators%20%281%29.md) 서문, §§1–6

## 기술 제약과 의존성

- 풀스택은 실제 인증과 데이터베이스를 사용해 기기 간 기록 접근을 지원한다. 프런트엔드 전용은 브라우저에 저장한다. 프레임워크 선택은 열려 있다.
- 외부 도서 API 연동, 요청 한도·오류·누락·판본 처리, 공개 HTTPS 배포와 비밀값 보호가 요구된다.
- 주간 독서량 등 시간에 따른 지표에는 진도 이력이 필요하다. 현재 페이지 값만으로는 주간 변화량을 재구성할 수 없다.
- 검색 표시 목표는 기술 문서에서 API 지연을 포함해 1.5초 미만이고, 핵심 문서의 확장 성능 항목에서는 API 응답 후 1초 이내다. 측정 시작점이 다르다.

근거는 [technical-requirements (1).md](../../requirements/technical-requirements%20%281%29.md) 「데이터베이스」, 「인증」, 「도서 데이터 API 연동」, 「배포」, 「성능 목표」, 「기술 선택」, 「프런트엔드 전용 대안」과 [core-requirements.md](../../requirements/core-requirements.md) §19다. 남은 범위와 해석은 [미해결 질문](open-questions.md)에 기록했다.

## 풀스택 1차 구현 점검

핵심 기능 12개에 대응하는 코드가 있다. 아래 내용은 소스와 README를 대조한 결과다. 테스트와 공개 배포 환경 점검은 진행 전이다. 연간 결산, 도서 탐색, 진도 기록의 기존 설계 근거는 README의 「Design Decisions」에 있다. [App.tsx](../../src/App.tsx) · [README.md](../../README.md)

| 수용 기준 | 소스에서 확인한 상태 | 완료 전 검토 |
|---|---|---|
| §1 도서 검색과 추가 | 단일 판본은 ‘읽고 싶은 책’으로 바로 추가된다. 여러 판본이 있는 책은 판본 대화상자에서 책장을 고를 수 있다. [AddBook.tsx](../../src/components/AddBook/AddBook.tsx) | 모든 검색 결과에서 원하는 책장을 골라 추가할 수 있는지 확인한다. 기본 책장에 한 번에 추가하는 흐름과 판본 선택을 함께 검토한다. |
| §5 독서 진도 | 종이책은 페이지 번호를 입력하거나 전체 페이지 수를 직접 지정한다. 백분율 입력은 전자책 형식에 연결돼 있다. [ProgressLogger.tsx](../../src/components/ProgressLogger/ProgressLogger.tsx) · [ReadingFormatEditor.tsx](../../src/components/ProgressLogger/ReadingFormatEditor.tsx) | 전체 페이지 수가 없는 종이책도 형식을 유지하면서 백분율을 기록할 수 있어야 한다. |
| §11 계정 저장 및 조회 | 책장 화면은 서재 전체를 불러온 뒤 해당 책만 골라 보여 준다. 읽기 설정과 책장 보기 방식은 브라우저에 저장한다. [supabaseRepository.ts](../../src/data/supabaseRepository.ts) · [ShelfPage.tsx](../../src/pages/ShelfPage/ShelfPage.tsx) · [preferences.ts](../../src/lib/preferences.ts) · [shelfView.ts](../../src/lib/shelfView.ts) | 책장 단위 조회와 계정에 저장할 설정의 범위를 확인한다. |
| §11 저장 일관성 | 진도 값과 이력을 별도 요청으로 저장한다. 한 요청만 성공하면 화면을 되돌린 뒤에도 DB에 일부 변경이 남을 수 있다. [LibraryContext.tsx](../../src/state/LibraryContext.tsx) | 부분 실패 후 상태와 여러 탭에서 동시에 수정할 때의 동작을 확인한다. |

수용 기준의 출처는 [core-requirements.md](../../requirements/core-requirements.md) §§1·5·11이다.

### 공개 배포에서 확인할 사항

- 일반 방문자가 회원가입과 비밀번호 재설정 이메일을 받고 각 흐름을 끝까지 마칠 수 있는지 확인한다. README에 기본 인증 메일 발송의 제약이 기록돼 있다. [core-requirements.md](../../requirements/core-requirements.md) §8 · [README.md](../../README.md) 「Known Limitations」
- 모바일에서 진도 갱신과 목표 조작을 확인하고, 100권 이상 서재의 로딩과 API 지연을 포함한 검색 응답 시간을 측정한다. README의 Lighthouse 점수는 이전 측정 기록이다. [core-requirements.md](../../requirements/core-requirements.md) §§4·7 · [technical-requirements (1).md](../../requirements/technical-requirements%20%281%29.md) 「성능 목표」
- 현재의 평점·장르 기반 추천은 알고리즘 추천을 제외한다는 제품 정의와 맞춰 봐야 한다. 유지 여부는 학습자의 결정 사항이다. [product-definition (1).md](../../requirements/product-definition%20%281%29.md) 「왜 필요한가」 · [design-challenges (1).md](../../requirements/design-challenges%20%281%29.md) §2 · [Discovery.tsx](../../src/components/Discovery/Discovery.tsx)

### 다음 작업

첫 보완 후보는 **전체 페이지 수를 모르는 종이책의 백분율 기록**이다. 우선순위와 구현은 아직 결정하지 않았다. 이 항목을 선택하면 기존 페이지 입력을 유지하면서 백분율도 입력할 수 있는 방식을 간단히 비교하고, 대시보드와 상세 화면에서 값이 저장·표시되는지와 100%에서 완독 확인이 나오는지 점검한다. [core-requirements.md](../../requirements/core-requirements.md) §5

필수 기준의 보완은 수요 실험과 병행할 수 있다. 별도 실험은 제품의 핵심 가치에 영향을 주는 불확실한 가설에 적용한다. 예상 완독일 실험은 진행 전이며 완료 점검이나 개발 착수의 조건으로 삼지 않는다. 이후 확정한 제품 결정의 근거와 검증되지 않은 가정은 README에 기록한다. [experiments.md](experiments.md)
