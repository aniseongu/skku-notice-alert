import { APP_NAME } from './brand';
import { GitHubError, deleteSecret, listSecrets, saveSecret } from './github';

interface PushConfiguration { publicKey: string; repository: string }
// 예전에는 기기 한 대만 WEB_PUSH_SUBSCRIPTION에 저장했다. 이 기기가 그 한 대였는지 기억하는 열쇠다.
const LEGACY = 'browser-push-registered';
// 지금은 기기마다 빈 칸 WEB_PUSH_SUB_1..8 하나에 저장한다(D-019). 여러 기기가 함께 받는다.
// 이 기기가 쓰는 칸과 구독 지문을 기억해 두었다가 끌 때 그 칸만 지운다.
const DEVICE = 'browser-push-device';
const CANVAS_MODE = 'browser-push-canvas-mode';
export type CanvasPushMode = 'off' | 'summary' | 'reminders';
export const DEVICE_SLOTS = Array.from({ length: 8 }, (_, index) => `WEB_PUSH_SUB_${index + 1}`);

function myDevice(): { fingerprint: string; slot: string } | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DEVICE) ?? 'null');
    if (parsed && typeof parsed === 'object' && 'fingerprint' in parsed && 'slot' in parsed
      && typeof parsed.fingerprint === 'string' && DEVICE_SLOTS.includes(String(parsed.slot))) {
      return { fingerprint: parsed.fingerprint, slot: String(parsed.slot) };
    }
  } catch { /* 모르면 새 칸을 고른다 */ }
  return null;
}

export function defaultCanvasPushMode(): CanvasPushMode {
  return typeof matchMedia === 'function'
    && matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches ? 'reminders' : 'off';
}

export function canvasPushMode(): CanvasPushMode | null {
  try {
    const mode = localStorage.getItem(CANVAS_MODE);
    return mode === 'off' || mode === 'summary' || mode === 'reminders' ? mode : null;
  } catch { return null; }
}

export function supportsBrowserPush(): boolean {
  return isSecureContext && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function pushConfiguration(): Promise<PushConfiguration> {
  const response = await fetch(new URL('web-push.json', document.baseURI), { cache: 'no-store' });
  if (!response.ok) throw new Error('알림 연결을 준비하지 못했어요. 잠시 뒤 다시 시도해 주세요');
  return response.json() as Promise<PushConfiguration>;
}

async function fingerprint(subscription: PushSubscription): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function browserPushEnabled(): Promise<boolean> {
  if (!supportsBrowserPush() || Notification.permission !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const mine = await fingerprint(subscription);
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(LEGACY); } catch { /* 없으면 새 방식만 본다 */ }
  return myDevice()?.fingerprint === mine || legacy === mine;
}

export async function subscribeBrowserPush(): Promise<PushSubscription> {
  if (!supportsBrowserPush()) throw new Error('이 브라우저에서는 알림을 연결할 수 없어요. 최신 브라우저에서 열어 주세요');
  // 허용 요청은 단추를 누른 직후 실행해야 브라우저가 표시한다.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('주소창의 사이트 설정에서 알림을 허용한 뒤 다시 눌러 주세요');
  const config = await pushConfiguration();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  const encoded = config.publicKey.replace(/-/g, '+').replace(/_/g, '/');
  const key = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
  try {
    return await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    throw new Error('브라우저가 알림을 연결하지 못했어요. 브라우저를 최신 버전으로 바꾸고 다시 눌러 주세요');
  }
}

async function saveDeviceSubscription(
  repo: string, token: string, subscription: PushSubscription, mode: CanvasPushMode,
): Promise<void> {
  const config = await pushConfiguration();
  if (repo !== config.repository) throw new GitHubError('이 사이트를 배포한 GitHub 저장소에 연결해 주세요');
  const mine = await fingerprint(subscription);
  const device = myDevice();
  // 현재 구독과 지문이 다르면 기존 칸을 덮지 않는다. 예전 구독은 빈 기기 칸에 복사한다.
  const used = await listSecrets(repo, token);
  const slot = (device?.fingerprint === mine ? device.slot : undefined)
    ?? DEVICE_SLOTS.find((name) => !used[name]);
  if (!slot) throw new GitHubError('알림은 기기 8대까지 받을 수 있어요. 안 쓰는 기기에서 알림을 먼저 꺼 주세요');
  await saveSecret(repo, token, slot, JSON.stringify({ ...subscription.toJSON(), preferences: { canvas: mode } }));
  try { localStorage.setItem(DEVICE, JSON.stringify({ fingerprint: mine, slot })); } catch { /* 저장 실패 시 서버 구독은 유지한다 */ }
}

export async function connectBrowserPush(repo: string, token: string): Promise<void> {
  const subscription = await subscribeBrowserPush();
  const mode = canvasPushMode() ?? defaultCanvasPushMode();
  await saveDeviceSubscription(repo, token, subscription, mode);
  try { localStorage.setItem(CANVAS_MODE, mode); } catch { /* 서버에 저장된 기기 설정은 유지한다 */ }
}

/** 이 기기의 기존 구독만 바꾼다. 새 구독과 알림 권한 요청은 하지 않는다. */
export async function setCanvasPushMode(repo: string, token: string, mode: CanvasPushMode): Promise<void> {
  if (mode !== 'off' && mode !== 'summary' && mode !== 'reminders') throw new Error('알림 방식을 다시 골라 주세요');
  const registration = await navigator.serviceWorker?.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) throw new Error('먼저 이 기기에서 알림 받기를 켜 주세요');
  await saveDeviceSubscription(repo, token, subscription, mode);
  try { localStorage.setItem(CANVAS_MODE, mode); } catch { /* 설정은 서버 구독에 저장했다 */ }
}

export async function disconnectBrowserPush(repo: string, token: string): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const mine = await fingerprint(subscription);
    const device = myDevice();
    if (device) await deleteSecret(repo, token, device.slot).catch(() => {});
    // 이 기기가 예전 한 대 저장의 주인일 때만 그 Secret도 지운다(다른 기기 것은 건드리지 않는다).
    let legacy = false;
    try { legacy = localStorage.getItem(LEGACY) === mine; } catch { /* 모르면 지우지 않는다 */ }
    if (legacy) await deleteSecret(repo, token, 'WEB_PUSH_SUBSCRIPTION').catch(() => {});
    await subscription.unsubscribe();
  }
  try { localStorage.removeItem(DEVICE); localStorage.removeItem(LEGACY); } catch { /* 로컬 기록을 지우지 못해도 서버 발송은 멈춘다 */ }
}

export async function testBrowserNotification(): Promise<void> {
  if (!supportsBrowserPush() || Notification.permission !== 'granted') throw new Error('먼저 이 기기에서 알림 받기를 켜 주세요');
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification(`${APP_NAME} 테스트 알림`, {
    body: '이 알림이 보이면 이 기기에서 알림을 표시할 수 있어요',
    icon: new URL('icon-192.png', registration.scope).href,
    tag: 'skku-notice-test',
    data: { url: registration.scope },
  });
}
