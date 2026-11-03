# Gemini 공개 공지 요약 보완 조사 (2026-11-04)

- 기존 기능: 새 공지는 개인 기준 판정과 함께 요약한다. 첫 실행 이전 글이나 본문을 나중에 받은 글은 판정 호출 대상이 아니어서 요약이 없을 수 있다. 번역, 이미지 OCR, 마감 추출은 이미 별도로 존재한다.
- 참고: [Google Gen AI Python SDK의 JSON 응답 예제](https://github.com/googleapis/python-genai#json-response-schema). SDK의 `generate_content`에 JSON MIME 형식과 응답 스키마를 지정하는 방법을 사용했다. Context7의 `/googleapis/python-genai` 문서도 확인했다. SDK 구현 파일을 복사하지 않았다.
- 적용: 학교 공개 공지 중 본문이 충분하고 기존 요약이 없는 이미 본 글만 실행당 최대 6건, 한 번 호출로 요약한다. 기존 요약은 덮지 않고 제목, 본문, 글 id만 보낸다. 프로필, 관심 키워드, 아이캠퍼스 자료는 보내지 않는다. 인턴 공고는 이번 범위에서 제외했다.
- 제한: API 실패는 다음 실행에 맡기고, 응답에서 특정 글이 두 번 빠지면 그 글은 건너뛴다. 생성 결과는 원문을 대체하지 않는다. 실제 Gemini 호출 품질과 과금은 자동 테스트로 검증할 수 없다.

## 인턴 본문과 이미지 판정 추가

- 사용자 후속 요청으로 인턴 IT 관련성 판정은 키워드 정책에서 Gemini 전용 배치로 바꾼다. 같은 [Google Gen AI SDK 구조화 응답](https://github.com/googleapis/python-genai#json-response-schema)과 이미지 `Part.from_bytes` 예제를 사용한다.
- 공개 본문 전문과 공고별 id가 표시된 이미지 bytes를 함께 보내고 모델의 relevant 판정만 알림으로 연결한다. 로고와 회사 소개만 보고 직무를 추정하지 않도록 지시한다. 호출 실패나 준비 전에는 대기한다.
- [WordPress Site Accelerator](https://wordpress.com/support/site-accelerator-cdn/)와 [Jetpack Image CDN](https://jetpack.com/support/site-accelerator/)의 i0.wp.com을 포함해 실제 공고에서 확인한 정확한 이미지 호스트만 허용한다. 고정 외부 호스트의 공개 이미지를 처리하며 요청에 인증정보는 넣지 않는다.
