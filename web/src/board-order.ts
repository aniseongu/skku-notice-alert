// 게시판 순서. "모든 게시판"은 늘 맨 앞이라 여기서 다루지 않는다.
// 저장된 순서대로 두고, 저장에 없는 게시판은 설정(config) 순서로 뒤에 붙이고, 모르는 id는 버린다.
export const BOARD_ORDER_VARIABLE = 'BOARD_ORDER';

export function orderBoards<T extends { id: string }>(sources: T[], saved: string[]): T[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const first = [...new Set(saved)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const used = new Set(first.map((s) => s.id));
  return [...first, ...sources.filter((s) => !used.has(s.id))];
}

export function moveBoard(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function parseBoardOrder(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? '[]');
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}
