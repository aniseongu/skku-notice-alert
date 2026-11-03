// 저장한 키의 이름과 날짜만 기억한다. 키 값과 토큰은 저장하지 않는다.
function metadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([name, date]) =>
    /^[A-Z][A-Z0-9_]*$/.test(name) && typeof date === 'string' && Number.isFinite(Date.parse(date))));
}

export function readSavedSecrets(repo: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`saved-secrets:${repo}`) ?? '{}');
    return metadata(parsed);
  } catch { return {}; }
}

export function rememberSavedSecrets(repo: string, saved: Record<string, string>): void {
  try {
    localStorage.setItem(`saved-secrets:${repo}`, JSON.stringify(metadata(saved)));
  } catch { /* 기억하지 못해도 GitHub에 저장한 키는 유지된다 */ }
}
