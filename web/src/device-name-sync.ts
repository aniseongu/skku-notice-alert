import { browserPushEnabled, currentDeviceSlot } from './browser-push';
import { chooseDeviceName, deviceNameVariable, validDeviceName } from './device-names';
import { createVariableIfAbsent, listSecrets, readVariable, saveVariable } from './github';

/** Only the device whose current subscription is verified may suggest a shared name. */
export async function syncCurrentDeviceName(repo: string, token: string): Promise<string | null> {
  if (!await browserPushEnabled()) return null;
  const slot = currentDeviceSlot();
  if (!slot) return null;
  const secrets = await listSecrets(repo, token);
  // 구독 지문은 browserPushEnabled가 이미 확인했다. 등록 시각까지 같아야 한다는 조건은 이름 채우기에는 너무 엄격하다.
  if (!secrets[slot]) return null;
  const variable = deviceNameVariable(slot);
  const existing = await readVariable(repo, token, variable);
  if (existing !== null && validDeviceName(existing)) return existing.trim();
  const suggestion = await chooseDeviceName();
  const latest = await listSecrets(repo, token);
  if (!await browserPushEnabled() || currentDeviceSlot() !== slot || !latest[slot]) return null;
  // 새 칸은 이름 변수를 빈 값으로 비워 두므로, 빈 값이면 덮어쓴다.
  if (existing === null) {
    if (await createVariableIfAbsent(repo, token, variable, suggestion)) return suggestion;
    const winner = await readVariable(repo, token, variable);
    return winner && validDeviceName(winner) ? winner.trim() : null;
  }
  await saveVariable(repo, token, variable, suggestion);
  return suggestion;
}
