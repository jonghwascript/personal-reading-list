# 미해결 질문

## 사용자 문제

- 완독 후 남길 문장을 고르는 일이 얼마나 자주 어렵고, 요약을 마치는 데 어느 정도 영향을 주는지.
- 요약이 책의 핵심 문장이나 생각을 나중에 기억하는 데 실제로 도움이 됐는지.
- 예상 완독일을 본 뒤 본인이 실제로 추가 독서 시간을 확보해 읽는지. [실험](experiments.md)
- 다른 독자에게도 이 상황이 생기는지, 독서 모임에서는 모임 일정에 맞춰 읽을 때 비슷한 필요가 있는지.

## 요구사항 해석

- 게스트의 예시 통계와 프런트엔드 전용의 통계 요구를 충족하는 기본 범위, 별도로 직접 설계할 심화 결산의 범위. [core-requirements.md](../../requirements/core-requirements.md) §10 · [design-challenges (1).md](../../requirements/design-challenges%20%281%29.md) §1 · [technical-requirements (1).md](../../requirements/technical-requirements%20%281%29.md) 「프런트엔드 전용 대안」
- 알고리즘 추천을 제외한다는 제품 정의와 디자인 과제의 개인화 추천 및 선택 사항인 AI 추천이 만나는 범위. [product-definition (1).md](../../requirements/product-definition%20%281%29.md) 「왜 필요한가」 · [design-challenges (1).md](../../requirements/design-challenges%20%281%29.md) §2 · [differentiators (1).md](../../requirements/differentiators%20%281%29.md) §2
- 맞춤 책장을 삭제할 때 서재에 남는 책의 이동 정책. 책은 정확히 한 책장에 속해야 한다. ISBN이 없거나 다른 판본을 같은 책으로 볼 기준도 열려 있다. [core-requirements.md](../../requirements/core-requirements.md) §§1·2·12 · [technical-requirements (1).md](../../requirements/technical-requirements%20%281%29.md) 「데이터베이스」
- 장르 필터는 핵심이고 편집 가능한 장르 태그는 확장이다. API 장르 정보가 없을 때의 처리 기준이 남아 있다. 내 서재 검색의 500ms 목표도 확장 기능을 선택했을 때 적용하는지 명시되어 있지 않다. [core-requirements.md](../../requirements/core-requirements.md) §§4·14·16 · [technical-requirements (1).md](../../requirements/technical-requirements%20%281%29.md) 「도서 데이터 API 연동」, 「성능 목표」
