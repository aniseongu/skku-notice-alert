// 읽은 공지 id. 이 기기에 두고, GitHub에 연결돼 있으면 Actions 변수 READ_NOTICES로 기기 간에 맞춘다.
export const READ_VARIABLE = 'READ_NOTICES';
// 변수 크기(48KB) 안에서 최근 것만 남긴다. 목록에 오래 남는 글보다 넉넉하다.
export const READ_LIMIT = 800;
const KEY = 'read-notices';

export function parseRead(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export function loadRead(): string[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? null : parseRead(raw);
  } catch { return []; }
}

export function storeRead(ids: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* 기억하지 못해도 화면은 돈다 */ }
}

export function addRead(ids: string[], id: string): string[] {
  return [...ids.filter((x) => x !== id), id].slice(-READ_LIMIT);
}

/** 두 기기의 읽음을 합친다. 순서는 먼저 읽은 것부터, 최근 READ_LIMIT개. */
export function mergeRead(remote: string[], local: string[]): string[] {
  return [...new Set([...remote, ...local])].slice(-READ_LIMIT);
}
