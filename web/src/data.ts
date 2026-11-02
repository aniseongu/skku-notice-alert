// 정적 API v1(D-010) 형식과, 화면에서 쓰는 날짜와 분류 계산. 네트워크는 fetchJson에만 있다.

export interface Source { id: string; name: string; url: string }

export interface Notice {
  id: string;
  source_id: string;
  article_no: string;
  title: string;
  category: string | null;
  url: string;
  posted_on: string;
  pinned: boolean;
  deadline: string | null;
  first_seen: string | null;
}

export type Verdict = 'relevant' | 'maybe' | 'not_relevant';

export interface Judgement {
  rule_name: string | null;
  priority: 'high' | 'default' | 'low' | null;
  reasons: string[];
  ai: { verdict: Verdict; reason: string; model: string } | null;
  notified: boolean;
}

export interface NoticesFile { version: number; generated_at: string; sources: Source[]; notices: Notice[] }
export interface MatchedFile { version: number; generated_at: string; items: Record<string, Judgement> }

// 개발 중에는 ?api=sample/api/v1 로 예시 데이터를 본다.
const API = new URLSearchParams(location.search).get('api') ?? 'api/v1';

export async function fetchJson<T>(name: string, optional = false): Promise<T | null> {
  const response = await fetch(`${API}/${name}`, { cache: 'no-cache' });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export const VERDICT_LABEL: Record<Verdict, string> = { relevant: '해당', maybe: '확인 필요', not_relevant: '해당 없음' };

export function isMine(judgement: Judgement | undefined): boolean {
  if (!judgement) return false;
  const verdict = judgement.ai?.verdict;
  return judgement.notified || verdict === 'relevant' || verdict === 'maybe';
}

export const boardName = (source: Source | undefined, fallback: string) => (source?.name ?? fallback).replace(/\s*공지$/, '');

// 날짜 계산은 모두 한국 시간 기준 날짜(YYYY-MM-DD)로 한다.
const kstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
const WEEKDAY = '일월화수목금토';

export const todayKst = () => kstDay.format(new Date());
const toUtc = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dayDiff = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / 86_400_000);

export function koreanDate(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAY[new Date(toUtc(day)).getUTCDay()]})`;
}

export function postedGroup(day: string, today: string): string {
  const diff = dayDiff(day, today);
  if (diff <= 0) return '오늘';
  if (diff === 1) return '어제';
  return koreanDate(day);
}

export const deadlinePassed = (iso: string) => new Date(iso).getTime() < Date.now();
export const daysLeft = (iso: string, today: string) => dayDiff(today, kstDay.format(new Date(iso)));

export function deadlineGroup(iso: string, today: string): string {
  const days = daysLeft(iso, today);
  if (days <= 0) return '오늘 마감';
  if (days <= 3) return '3일 안';
  if (days <= 7) return '일주일 안';
  return '그 뒤';
}

export function deadlineText(iso: string, today: string): string {
  if (deadlinePassed(iso)) return '마감';
  const days = daysLeft(iso, today);
  return days <= 0 ? '오늘' : `D-${days}`;
}

export function deadlineDetail(iso: string): string {
  const date = new Date(iso);
  const day = kstDay.format(date);
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return time === '23:59' ? koreanDate(day) : `${koreanDate(day)} ${time}`;
}

export type IconName = 'ginkgo' | 'coin' | 'briefcase' | 'calendar' | 'trophy' | 'book' | 'alarm'
  | 'search' | 'refresh' | 'list' | 'user-check';

// 분류 글자와 제목 단어로 아이콘을 고른다. 알림 아이콘(scripts/build_icons.py NOTIFY)과 같은 이름.
const CATEGORY_ICONS: [IconName, RegExp][] = [
  ['coin', /장학|등록금|학자금/],
  ['trophy', /공모전|해커톤|경진|대회|챌린지/],
  ['briefcase', /채용|인턴|취업|모집|현장실습|아르바이트|TA/],
  ['calendar', /행사|세미나|특강|설명회|콜로키움|성과공유회|만남/],
  ['book', /학사|수업|수강|계절|학점|졸업|시험/],
];

export function categoryIcon(notice: Notice): IconName {
  const text = `${notice.category ?? ''} ${notice.title}`;
  return CATEGORY_ICONS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'ginkgo';
}
