import { GitHubError, deleteSecret, saveSecret } from './github';

interface PushConfiguration { publicKey: string; repository: string }
// 예전에는 기기 한 대만 WEB_PUSH_SUBSCRIPTION에 저장했다. 이 기기가 그 한 대였는지 기억하는 열쇠다.
const LEGACY = 'browser-push-registered';
// 지금은 기기마다 WEB_PUSH_SUB_<지문 앞 16자리>로 따로 저장한다(D-019). 여러 기기가 함께 받는다.
const DEVICE = 'browser-push-device';
export const deviceSecret = (fingerprint: string) => `WEB_PUSH_SUB_${fingerprint.slice(0, 16).toUpperCase()}`;

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
  try { return [localStorage.getItem(DEVICE), localStorage.getItem(LEGACY)].includes(mine); } catch { return false; }
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
    throw new Error('브라우저가 알림 연결을 완료하지 못했어요. 최신 버전인지 확인하고 다시 시도해 주세요');
  }
}

export async function connectBrowserPush(repo: string, token: string): Promise<void> {
  const subscription = await subscribeBrowserPush();
  const config = await pushConfiguration();
  if (repo !== config.repository) throw new GitHubError('이 사이트를 배포한 GitHub 저장소에 연결해 주세요');
  const mine = await fingerprint(subscription);
  await saveSecret(repo, token, deviceSecret(mine), JSON.stringify(subscription.toJSON()));
  try { localStorage.setItem(DEVICE, mine); } catch { /* 비공개 모드에서도 구독은 저장한다 */ }
}

export async function disconnectBrowserPush(repo: string, token: string): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    const mine = await fingerprint(subscription);
    await deleteSecret(repo, token, deviceSecret(mine)).catch(() => {});
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
  await registration.showNotification('성대 공지 테스트 알림', {
    body: '이 알림이 보이면 이 기기에서 알림을 표시할 수 있어요',
    icon: new URL('icon-192.png', registration.scope).href,
    tag: 'skku-notice-test',
    data: { url: registration.scope },
  });
}
