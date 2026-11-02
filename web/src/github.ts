// 설정 화면에서 키를 GitHub 저장소 Secrets로 바로 보낸다(docs/design/ux-rules.md 2-2절).
// 키 값은 브라우저에 저장하지 않고, GitHub가 준 저장소 공개키로 봉인(libsodium sealed box)해서만 보낸다.
// GitHub 토큰은 이 모듈 밖으로 나가지 않고, 화면을 닫으면 잊는다.

const API = 'https://api.github.com';
export const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export class GitHubError extends Error {}

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

async function call(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...headers(token), ...(init.headers ?? {}) } });
  if (response.status === 401) throw new GitHubError('GitHub 토큰이 맞지 않아요');
  if (response.status === 403 || response.status === 404) throw new GitHubError('저장소를 찾을 수 없거나 권한이 없어요');
  if (!response.ok && response.status !== 409) throw new GitHubError(`GitHub 오류 (${response.status})`);
  return response;
}

export async function listSecrets(repo: string, token: string): Promise<Record<string, string>> {
  const response = await call(`/repos/${repo}/actions/secrets?per_page=100`, token);
  const body = (await response.json()) as { secrets: { name: string; updated_at: string }[] };
  return Object.fromEntries(body.secrets.map((s) => [s.name, s.updated_at]));
}

export async function saveSecret(repo: string, token: string, name: string, value: string): Promise<void> {
  const keyResponse = await call(`/repos/${repo}/actions/secrets/public-key`, token);
  const { key, key_id: keyId } = (await keyResponse.json()) as { key: string; key_id: string };
  // 암호화 라이브러리는 저장할 때만 불러온다(목록 화면을 가볍게).
  const sodium = (await import('libsodium-wrappers')).default;
  await sodium.ready;
  const sealed = sodium.crypto_box_seal(sodium.from_string(value), sodium.from_base64(key, sodium.base64_variants.ORIGINAL));
  await call(`/repos/${repo}/actions/secrets/${name}`, token, {
    method: 'PUT',
    body: JSON.stringify({ encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL), key_id: keyId }),
  });
}

// 관심 키워드는 비밀이 아니라서 Actions 변수(INTEREST_KEYWORDS)로 둔다.
export async function saveVariable(repo: string, token: string, name: string, value: string): Promise<void> {
  const created = await call(`/repos/${repo}/actions/variables`, token, { method: 'POST', body: JSON.stringify({ name, value }) });
  if (created.status === 409) {
    await call(`/repos/${repo}/actions/variables/${name}`, token, { method: 'PATCH', body: JSON.stringify({ name, value }) });
  }
}

// Gemini 키가 맞는지 모델 목록을 하나만 불러 본다. 키는 Google로만 간다.
export async function checkGeminiKey(key: string): Promise<boolean> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
    headers: { 'x-goog-api-key': key },
  });
  return response.ok;
}

export async function sendTestNotification(topic: string): Promise<boolean> {
  const response = await fetch('https://ntfy.sh/', {
    method: 'POST',
    body: JSON.stringify({
      topic,
      title: '성대 공지 테스트 알림',
      message: '이 알림이 보이면 휴대폰과 PC 알림 연결이 끝났어요',
      click: location.origin + location.pathname,
      tags: ['white_check_mark'],
    }),
  });
  return response.ok;
}

export function newTopic(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return `skku-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')}`;
}
