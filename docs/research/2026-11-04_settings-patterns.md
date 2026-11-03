# 설정 화면 구조 조사 (2026-11-04)

사용자 요청: 설정을 단순하게 나누고 휴대폰 연결, 캘린더, 키 관리가 숨지 않게 한다. 아래는 소스와 공식 문서 확인이며 사용자 실험은 아니다.

## 오픈소스 근거

- [Miniflux 공식 외부 앱 연결 안내](https://miniflux.app/docs/apps.html): 설정에서 Integrations와 API Keys를 서로 다른 곳으로 분리한다. 서비스 연결과 인증 정보 관리를 개별 목적에 맞게 찾아갈 수 있다. 단, 설정 첫 화면이 개요 카드인지까지는 이 문서로 확인하지 못했다.
- [FreshRSS 공식 설정 안내](https://freshrss.github.io/FreshRSS/en/users/05_Configuration.html): 화면 표시, 프로필, 확장 설정을 나누고 확장별 관리 화면으로 들어간다. [모바일 연결 안내](https://freshrss.github.io/FreshRSS/en/users/06_Mobile_access.html)는 외부 접근 설정과 모바일 API 암호를 구분한다. 연결이 필요한 이유와 관리 위치를 함께 알려 주는 근거다.
- Linkding은 [일반 설정 템플릿](https://github.com/sissbruecker/linkding/blob/master/bookmarks/templates/settings/general.html)과 [연결 설정 템플릿](https://github.com/sissbruecker/linkding/blob/master/bookmarks/templates/settings/integrations.html)을 분리하고, 후자에서 외부 서비스와 API 토큰을 관리한다. 실제로 첫 화면이 요약 메뉴인지는 이 소스만으로 주장하지 않는다.

## 현재 화면과 권장 구조

현재 `settings-view.ts`는 GitHub 연결과 QR, 이 기기 알림과 분류, 아캠 알림, 키 화면 링크, 관심 키워드, 캘린더와 피드, 화면 모드를 한 화면에 모은다. 키 화면에는 Gemini, 아이캠퍼스, 프로필과 구글 캘린더 연결이 따로 있고 캘린더 관련 진입점이 둘이다.

제안: 설정 첫 화면을 상태가 보이는 간결한 행으로 두고 각 행은 한 기능 화면으로 연다. 이는 위 자료를 바탕으로 한 이 프로젝트의 설계 제안이다.

- **알림**: 이 기기 알림, 분류, 아캠 알림 범위. 연결 전에는 저장된 설정을 확인할 수 없다고 표시한다.
- **관심 키워드**: 추가와 삭제, 동기화 상태.
- **캘린더**: 구글 자동 연결과 캘린더 구독을 같은 화면에 두되, 자동 동기화와 구독의 차이를 간단히 적는다. 구글 연결에 필요한 키 입력도 여기서 바로 접근한다. RSS는 이 화면의 별도 피드 항목이나 고급 화면에 둔다.
- **기기 연결**: GitHub 연결 상태와 저장소, 휴대폰 QR 연결을 첫 화면에서 직접 찾게 한다. QR 확인 및 기존 저장소 검증을 유지한다.
- **연결 키와 내 정보**: Gemini 키, 아이캠퍼스 토큰, 프로필을 목적별로 관리한다. 기존 저장값, 암호화 기억과 잠금 상태, 저장과 확인 및 제거 동작을 유지하고 키 값을 개요 화면에 노출하지 않는다.
- **화면 모드**: 자주 쓰는 자동, 밝게, 어둡게 선택을 개요에 바로 둔다.

행에 현재 상태와 필요한 다음 행동을 보여 주되, 아직 읽지 못한 설정은 꺼짐이나 연결 안 됨으로 단정하지 않는다. GitHub 연결 필요 안내는 해당 화면 상단에 한 번 두고 입력 오류와 저장 결과는 해당 필드에 남긴다. 터치 영역과 접근성, 뒤로 가기, 기기별 알림과 전체 기기 설정의 차이를 유지한다.

## 연결과 저장 상태 표시 추가 조사

- [GitHub의 연결 앱 관리](https://docs.github.com/en/apps/oauth-apps/using-oauth-apps/reviewing-your-authorized-oauth-apps)는 앱 목록에서 권한을 확인하고 관리 메뉴에서 해제한다. 연결 성공 안내문을 여러 번 쌓는 방식의 근거는 아니다.
- [Atlassian 상태 컴포넌트](https://atlassian.design/components/lozenge)는 짧은 상태 이름을 쓴다. 우리 화면에서는 알약 배지를 복제하지 않고 중립 텍스트 한 번으로 표시한다.
- [Miniflux API 키 안내](https://miniflux.app/docs/api.html)는 Settings의 별도 API Keys 화면에서 키를 만든다. 관리 화면 분리 근거로 쓰고 API 자체를 우리 인증 방식으로 도입하지는 않는다.
- 적용: 평소에는 연결됨, 저장됨, 미설정 또는 확인 필요만 표시한다. 자동 재연결 성공 안내는 중복 표시하지 않는다. 키 입력과 수정, 구글 연결 및 연결 해제는 선택 후 펼친다. 성공이라는 이유만으로 모든 상태를 녹색으로 강조하지 않는다. 기기별 알림 범위는 실제 확인 전에는 꺼짐으로 단정하지 않는다.
