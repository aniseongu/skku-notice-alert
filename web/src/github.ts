// 설정 화면에서 키를 GitHub 저장소 Secrets로 바로 보낸다(docs/design/ux-rules.md 2-2절).
// 키 값은 브라우저에 저장하지 않고, GitHub가 준 저장소 공개키로 봉인(libsodium sealed box)해서만 보낸다.
// GitHub 토큰은 GitHub API에만 보낸다. 설정 화면이 이 기기에 기억한다(2026-11-03 사용자 요청).

const API = 'https://api.github.com';
// 아이디/저장소. 점만으로 된 부분(., ..)은 API 경로를 바꿀 수 있어서 막는다.
export const REPO_PATTERN = /^(?!\.{1,2}\/)[\w.-]+\/(?!\.{1,2}$)[\w.-]+$/;

export class GitHubError extends Error {}

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

// allowConflict: 변수 만들기에서만 409(이미 있음)를 정상으로 보고 수정으로 넘어간다. Secret 저장의 409는 실패다.
async function call(path: string, token: string, init: RequestInit = {}, allowConflict = false): Promise<Response> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...headers(token), ...(init.headers ?? {}) } });
  if (response.status === 401) throw new GitHubError('GitHub 토큰이 맞지 않아요. 새 토큰을 넣어 주세요');
  if (response.status === 403 || response.status === 404) throw new GitHubError('저장소 이름과 토큰 권한(Secrets, Variables)을 확인해 주세요');
  if (response.status === 409 && allowConflict) return response;
  if (!response.ok) throw new GitHubError(`GitHub가 요청을 받지 않았어요(오류 ${response.status}). 잠시 뒤 다시 해 주세요`);
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

export async function deleteSecret(repo: string, token: string, name: string): Promise<void> {
  await call(`/repos/${repo}/actions/secrets/${name}`, token, { method: 'DELETE' });
}

// 관심 키워드는 비밀이 아니라서 Actions 변수(INTEREST_KEYWORDS)로 둔다.
export async function readVariable(repo: string, token: string, name: string): Promise<string | null> {
  try {
    const response = await call(`/repos/${repo}/actions/variables/${name}`, token);
    return ((await response.json()) as { value: string }).value;
  } catch (error) {
    // 없는 변수(404)만 빈 값으로 본다. 인터넷 오류에 이 기기 키워드로 덮어쓰지 않게 한다.
    if (error instanceof GitHubError) return null;
    throw error;
  }
}

export async function saveVariable(repo: string, token: string, name: string, value: string): Promise<void> {
  // GitHub 변수는 빈 값을 받지 않는다(422). 비우면 변수를 지운다. 이미 없으면(404) 그대로 둔다.
  if (!value.trim()) {
    const response = await fetch(`${API}/repos/${repo}/actions/variables/${name}`, { method: 'DELETE', headers: headers(token) });
    if (response.ok || response.status === 404) return;
    if (response.status === 401) throw new GitHubError('GitHub 토큰이 맞지 않아요. 새 토큰을 넣어 주세요');
    throw new GitHubError(`GitHub가 요청을 받지 않았어요(오류 ${response.status}). 잠시 뒤 다시 해 주세요`);
  }
  const created = await call(`/repos/${repo}/actions/variables`, token, { method: 'POST', body: JSON.stringify({ name, value }) }, true);
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
