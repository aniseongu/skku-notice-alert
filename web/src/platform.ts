// 삼성 인터넷의 스크롤 바로가기 버튼이 화면 하단 중앙에 나타날 수 있다.
// 출처: https://r1.community.samsung.com/t5/서비스-기타/삼성-인터넷-17-0-0-42-맨-위로-맨-아래로-버튼-불편-문제/m-p/16327030
export function isSamsungInternet(userAgent: string): boolean {
  return /Android/i.test(userAgent) && /SamsungBrowser\//i.test(userAgent);
}
